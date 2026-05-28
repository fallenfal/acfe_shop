from django.db.models import Count, F, FloatField, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from activity.models import ActivityLog
from activity.services import log_activity
from core.mixins import LocationScopedMixin
from core.models import Location, UserLocationRole
from core.permissions import (
    CM_OR_ABOVE_ROLE_SLUGS,
    LocationPermission,
    PermissionRequired,
    user_is_org_owner,
)
from datechecks.api.services import (
    get_stock_item_date_check_history,
    latest_date_check_entry_subquery,
)
from inventory.api.serializers import (
    LocationStockDetailSerializer,
    LocationStockListSerializer,
    LocationStockUpdateSerializer,
    StockAdjustmentCreateSerializer,
    StockAdjustmentSerializer,
    StockItemDateCheckHistorySerializer,
    StockItemSerializer,
    StockTakeCreateSerializer,
    StockTakeDetailSerializer,
    StockTakeEntriesSubmitSerializer,
    StockTakeEntrySerializer,
    StockTakeListSerializer,
)
from inventory.api.services import apply_stock_adjustment, submit_stock_take_entries
from inventory.models import (
    LocationStock,
    StockAdjustment,
    StockItem,
    StockTake,
    StockTakeEntry,
)


def user_is_cm_or_above_in_org(user, organisation=None):
    org = organisation or getattr(user, "organisation", None)
    if org is None:
        return False
    if user_is_org_owner(user, org):
        return True
    return UserLocationRole.objects.filter(
        user=user,
        location__organisation=org,
        role__slug__in=CM_OR_ABOVE_ROLE_SLUGS,
    ).exists()


class IsCmOrAboveInOrg(BasePermission):
    message = "Only content managers and owners may perform this action."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return user_is_cm_or_above_in_org(request.user)


class LocationStockViewSet(LocationScopedMixin, viewsets.ModelViewSet):
    """Location-scoped stock at /api/locations/{location_id}/stock/ (lookup by stock_item_id)."""

    lookup_field = "stock_item_id"
    lookup_url_kwarg = "pk"
    http_method_names = ["get", "head", "options", "put"]

    def get_permissions(self):
        permission_map = {
            "list": "inventory.read",
            "retrieve": "inventory.read",
            "update": "inventory.update",
            "adjust": "inventory.update",
            "adjustments": "inventory.read",
            "alerts": "inventory.read",
            "date_check_history": "inventory.read",
        }
        perm_path = permission_map.get(self.action, "inventory.read")
        return [
            IsAuthenticated(),
            LocationPermission(),
            PermissionRequired(perm_path)(),
        ]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return LocationStockDetailSerializer
        if self.action in ("update", "partial_update"):
            return LocationStockUpdateSerializer
        return LocationStockListSerializer

    def get_queryset(self):
        qs = LocationStock.objects.filter(
            location=self.location,
            stock_item__organisation=self.location.organisation,
            stock_item__is_active=True,
        ).select_related("stock_item", "location")

        if self.action in ("list", "alerts"):
            qs = self._apply_list_filters(qs)
            qs = self._apply_sort(qs)
            latest_entry = latest_date_check_entry_subquery(self.location)
            qs = qs.annotate(
                latest_expiry_date=Subquery(
                    latest_entry.values("earliest_expiry")[:1]
                ),
                latest_expiry_status=Subquery(
                    latest_entry.values("expiry_status")[:1]
                ),
            )
        return qs

    def _apply_list_filters(self, queryset):
        params = self.request.query_params
        category = params.get("category")
        if category:
            queryset = queryset.filter(stock_item__category=category)
        below_par = params.get("below_par")
        if below_par is not None and below_par != "":
            if str(below_par).lower() in ("true", "1", "yes"):
                queryset = queryset.filter(current_quantity__lt=F("par_level"))
            elif str(below_par).lower() in ("false", "0", "no"):
                queryset = queryset.filter(current_quantity__gte=F("par_level"))
        return queryset

    def _apply_sort(self, queryset):
        sort = self.request.query_params.get("sort", "name")
        descending = sort.startswith("-")
        key = sort.lstrip("-")
        sort_map = {
            "name": "stock_item__name",
            "category": "stock_item__category",
            "quantity": "current_quantity",
        }
        order_field = sort_map.get(key, "stock_item__name")
        if descending:
            order_field = f"-{order_field}"
        return queryset.order_by(order_field, "stock_item__name")

    def get_object(self):
        stock_item_id = self.kwargs.get("pk")
        try:
            stock_item = StockItem.objects.get(
                pk=stock_item_id,
                organisation=self.location.organisation,
                is_active=True,
            )
        except StockItem.DoesNotExist as exc:
            raise NotFound("Stock item not found.") from exc

        location_stock, _ = LocationStock.objects.get_or_create(
            stock_item=stock_item,
            location=self.location,
            defaults={"current_quantity": 0, "par_level": 0, "unit_cost": 0},
        )
        return location_stock

    def retrieve(self, request, *args, **kwargs):
        location_stock = self.get_object()
        adjustments = (
            StockAdjustment.objects.filter(
                location=self.location,
                stock_item=location_stock.stock_item,
            )
            .select_related("stock_item", "related_location", "created_by")
            .order_by("-created_at")[:50]
        )
        serializer = LocationStockDetailSerializer(location_stock)
        data = serializer.data
        data["adjustments"] = StockAdjustmentSerializer(adjustments, many=True).data
        return Response(data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(LocationStockListSerializer(instance).data)

    def perform_update(self, serializer):
        instance = serializer.save()
        log_activity(
            self.request,
            ActivityLog.ActionType.STOCK_ADJUSTED,
            organisation=self.location.organisation,
            location=self.location,
            target_model="LocationStock",
            target_id=instance.id,
            details={
                "stock_item_id": str(instance.stock_item_id),
                "par_level": instance.par_level,
                "unit_cost": str(instance.unit_cost),
                "action": "location_stock_updated",
            },
        )

    @action(detail=False, methods=["get"], url_path="alerts")
    def alerts(self, request, location_id=None):
        qs = self.get_queryset().filter(current_quantity__lt=F("par_level"))
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="date-check-history")
    def date_check_history(self, request, location_id=None, pk=None):
        location_stock = self.get_object()
        history = get_stock_item_date_check_history(
            location=self.location,
            stock_item=location_stock.stock_item,
            limit=5,
        )
        serializer = StockItemDateCheckHistorySerializer(history, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="adjust")
    def adjust(self, request, location_id=None):
        input_serializer = StockAdjustmentCreateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        try:
            stock_item = StockItem.objects.get(
                pk=data["stock_item_id"],
                organisation=self.location.organisation,
                is_active=True,
            )
        except StockItem.DoesNotExist as exc:
            raise ValidationError({"stock_item_id": "Stock item not found."}) from exc

        adj_type = data["adjustment_type"]
        if adj_type == StockAdjustment.AdjustmentType.CORRECTION:
            quantity_change = data["quantity_change"]
        elif adj_type == StockAdjustment.AdjustmentType.TRANSFER_OUT:
            quantity_change = -data["quantity"]
        else:
            quantity_change = data["quantity"]

        related_location = None
        if adj_type == StockAdjustment.AdjustmentType.TRANSFER_OUT:
            try:
                related_location = Location.objects.get(
                    pk=data["related_location_id"],
                    organisation=self.location.organisation,
                    is_active=True,
                )
            except Location.DoesNotExist as exc:
                raise ValidationError(
                    {"related_location_id": "Related location not found."}
                ) from exc
            if related_location.id == self.location.id:
                raise ValidationError(
                    {"related_location_id": "Cannot transfer to the same location."}
                )

        try:
            adjustment, inverse = apply_stock_adjustment(
                location=self.location,
                stock_item=stock_item,
                adjustment_type=adj_type,
                quantity_change=quantity_change,
                related_location=related_location,
                notes=data.get("notes", ""),
                created_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        action_type = (
            ActivityLog.ActionType.STOCK_TRANSFER
            if adj_type == StockAdjustment.AdjustmentType.TRANSFER_OUT
            else ActivityLog.ActionType.STOCK_ADJUSTED
        )
        log_activity(
            request,
            action_type,
            organisation=self.location.organisation,
            location=self.location,
            target_model="StockAdjustment",
            target_id=adjustment.id,
            details={
                "stock_item_id": str(stock_item.id),
                "adjustment_type": adj_type,
                "quantity_change": quantity_change,
                "related_location_id": (
                    str(related_location.id) if related_location else None
                ),
                "inverse_adjustment_id": (
                    str(inverse.id) if inverse is not None else None
                ),
            },
        )

        return Response(
            StockAdjustmentSerializer(adjustment).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="adjustments")
    def adjustments(self, request, location_id=None):
        qs = (
            StockAdjustment.objects.filter(location=self.location)
            .select_related("stock_item", "related_location", "created_by")
            .order_by("-created_at")
        )
        stock_item_id = request.query_params.get("stock_item_id")
        if stock_item_id:
            qs = qs.filter(stock_item_id=stock_item_id)
        adjustment_type = request.query_params.get("adjustment_type")
        if adjustment_type:
            qs = qs.filter(adjustment_type=adjustment_type)
        serializer = StockAdjustmentSerializer(qs[:100], many=True)
        return Response(serializer.data)


class StockTakeViewSet(LocationScopedMixin, viewsets.ModelViewSet):
    """Stock takes at /api/locations/{location_id}/stock-takes/."""

    http_method_names = ["get", "head", "options", "post"]

    def get_permissions(self):
        if self.action in ("create", "submit_entries"):
            perm_path = "inventory.stock_take"
        else:
            perm_path = "inventory.read"
        return [
            IsAuthenticated(),
            LocationPermission(),
            PermissionRequired(perm_path)(),
        ]

    def get_serializer_class(self):
        if self.action == "create":
            return StockTakeCreateSerializer
        if self.action == "retrieve":
            return StockTakeDetailSerializer
        if self.action == "submit_entries":
            return StockTakeEntriesSubmitSerializer
        return StockTakeListSerializer

    def get_queryset(self):
        return (
            StockTake.objects.filter(location=self.location)
            .select_related("conducted_by")
            .annotate(
                items_counted=Count("entries", distinct=True),
                total_variance=Coalesce(
                    Sum("entries__variance"),
                    Value(0.0),
                    output_field=FloatField(),
                ),
            )
            .order_by("-conducted_at")
        )

    def perform_create(self, serializer):
        stock_take = serializer.save(
            location=self.location,
            conducted_by=self.request.user,
        )
        log_activity(
            self.request,
            ActivityLog.ActionType.STOCK_TAKE,
            organisation=self.location.organisation,
            location=self.location,
            target_model="StockTake",
            target_id=stock_take.id,
            details={"action": "stock_take_started"},
        )
        return stock_take

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        stock_take = self.perform_create(serializer)
        return Response(
            {"stock_take_id": str(stock_take.id)},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="entries")
    def submit_entries(self, request, location_id=None, pk=None):
        stock_take = self.get_object()
        serializer = StockTakeEntriesSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            entries = submit_stock_take_entries(
                stock_take, serializer.validated_data["entries"]
            )
        except ValueError as exc:
            raise ValidationError({"entries": str(exc)}) from exc

        total_variance = sum(e.variance or 0 for e in entries)
        log_activity(
            request,
            ActivityLog.ActionType.STOCK_TAKE,
            organisation=self.location.organisation,
            location=self.location,
            target_model="StockTake",
            target_id=stock_take.id,
            details={
                "action": "stock_take_entries_submitted",
                "items_counted": len(entries),
                "total_variance": total_variance,
            },
        )

        return Response(
            {
                "stock_take_id": str(stock_take.id),
                "entries": StockTakeEntrySerializer(entries, many=True).data,
                "items_counted": len(entries),
                "total_variance": total_variance,
            },
            status=status.HTTP_200_OK,
        )


class OrgStockItemViewSet(
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Org-level stock catalogue at /api/org/stock-items/ (CM+ only)."""

    serializer_class = StockItemSerializer
    http_method_names = ["head", "options", "post", "put"]
    lookup_field = "pk"
    lookup_url_kwarg = "id"

    def get_permissions(self):
        return [IsAuthenticated(), IsCmOrAboveInOrg()]

    def get_queryset(self):
        org = self.request.user.organisation
        if org is None:
            return StockItem.objects.none()
        return StockItem.objects.filter(organisation=org).order_by("category", "name")

    def perform_create(self, serializer):
        org = self.request.user.organisation
        stock_item = serializer.save(organisation=org)
        for location in Location.objects.filter(organisation=org, is_active=True):
            LocationStock.objects.get_or_create(
                stock_item=stock_item,
                location=location,
                defaults={"current_quantity": 0, "par_level": 0, "unit_cost": 0},
            )
        log_activity(
            self.request,
            ActivityLog.ActionType.STOCK_ADJUSTED,
            organisation=org,
            target_model="StockItem",
            target_id=stock_item.id,
            details={"action": "stock_item_created", "name": stock_item.name},
        )

    def perform_update(self, serializer):
        stock_item = serializer.save()
        log_activity(
            self.request,
            ActivityLog.ActionType.STOCK_ADJUSTED,
            organisation=stock_item.organisation,
            target_model="StockItem",
            target_id=stock_item.id,
            details={"action": "stock_item_updated", "name": stock_item.name},
        )
