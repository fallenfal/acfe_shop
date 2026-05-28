from django.db.models import Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from activity.models import ActivityLog
from activity.services import log_activity
from core.mixins import LocationScopedMixin
from core.permissions import (
    LocationPermission,
    PermissionRequired,
    user_is_cm_or_above,
)
from datechecks.api.pagination import DateCheckPagination
from datechecks.api.serializers import (
    DateCheckCreateSerializer,
    DateCheckDetailSerializer,
    DateCheckEntryBatchSerializer,
    DateCheckEntryCreateSerializer,
    DateCheckEntrySerializer,
    DateCheckEntryUpdateSerializer,
    DateCheckListSerializer,
    DateCheckScheduleSerializer,
    DateCheckScheduleUpdateSerializer,
    ExpiryAlertBulkResolveSerializer,
    ExpiryAlertResolveSerializer,
    ExpiryAlertSerializer,
)
from datechecks.api.services import (
    build_org_compliance,
    build_schedule_status,
    complete_date_check,
    create_date_check_entry,
    get_or_create_schedule,
    resolve_expiry_alert,
)
from datechecks.models import DateCheck, DateCheckEntry, DateCheckSchedule, ExpiryAlert
from inventory.models import StockItem
from sales.models import MenuItem
from waste.api.views import IsOrgOwner


class DateCheckViewSet(LocationScopedMixin, viewsets.ModelViewSet):
    """Date check rounds at /api/locations/{location_id}/date-checks/."""

    queryset = DateCheck.objects.all()
    pagination_class = DateCheckPagination
    http_method_names = ["get", "head", "options", "post", "delete"]

    def get_permissions(self):
        permission_map = {
            "create": "datechecks.create",
            "destroy": "datechecks.read",
            "complete": "datechecks.create",
        }
        perm_path = permission_map.get(self.action, "datechecks.read")
        return [
            IsAuthenticated(),
            LocationPermission(),
            PermissionRequired(perm_path)(),
        ]

    def get_serializer_class(self):
        if self.action == "create":
            return DateCheckCreateSerializer
        if self.action == "retrieve":
            return DateCheckDetailSerializer
        return DateCheckListSerializer

    def get_queryset(self):
        qs = (
            super()
            .get_queryset()
            .select_related("location", "conducted_by")
            .order_by("-started_at")
        )
        if self.action == "list":
            qs = self._apply_list_filters(qs)
        return qs

    def _apply_list_filters(self, queryset):
        params = self.request.query_params
        status_filter = params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        date_from = params.get("date_from")
        if date_from:
            queryset = queryset.filter(started_at__date__gte=date_from[:10])
        date_to = params.get("date_to")
        if date_to:
            queryset = queryset.filter(started_at__date__lte=date_to[:10])
        return queryset

    def get_object(self):
        obj = super().get_object()
        if self.action == "retrieve":
            obj = (
                DateCheck.objects.filter(pk=obj.pk, location=self.location)
                .select_related("location", "conducted_by")
                .prefetch_related("entries__stock_item", "entries__menu_item")
                .get()
            )
        return obj

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        date_check = serializer.save(
            location=self.location,
            conducted_by=request.user,
            status=DateCheck.Status.IN_PROGRESS,
        )
        log_activity(
            request,
            ActivityLog.ActionType.DATE_CHECK_STARTED,
            organisation=self.location.organisation,
            location=self.location,
            target_model="DateCheck",
            target_id=date_check.id,
        )
        return Response(
            DateCheckListSerializer(date_check).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        date_check = self.get_object()
        if date_check.status != DateCheck.Status.IN_PROGRESS:
            raise ValidationError(
                {"detail": "Only in-progress date checks can be deleted."}
            )
        if not user_is_cm_or_above(request.user, self.location):
            raise PermissionDenied(
                "Only content managers and owners may delete date checks."
            )
        date_check_id = date_check.id
        date_check.delete()
        log_activity(
            request,
            ActivityLog.ActionType.DATE_CHECK_STARTED,
            organisation=self.location.organisation,
            location=self.location,
            target_model="DateCheck",
            target_id=date_check_id,
            details={"action": "date_check_deleted"},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["put"], url_path="complete")
    def complete(self, request, location_id=None, pk=None):
        date_check = self.get_object()
        try:
            date_check, alerts = complete_date_check(date_check)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        log_activity(
            request,
            ActivityLog.ActionType.DATE_CHECK_COMPLETED,
            organisation=self.location.organisation,
            location=self.location,
            target_model="DateCheck",
            target_id=date_check.id,
            details={
                "items_checked": date_check.items_checked,
                "items_expired": date_check.items_expired,
                "items_expiring_soon": date_check.items_expiring_soon,
                "alerts_created": len(alerts),
            },
        )
        return Response(DateCheckDetailSerializer(date_check).data)


class DateCheckEntryViewSet(LocationScopedMixin, viewsets.ModelViewSet):
    """
    Entries under /api/locations/{location_id}/date-checks/{check_id}/entries/.
    """

    queryset = DateCheckEntry.objects.all()
    http_method_names = ["get", "head", "options", "post", "put", "patch", "delete"]
    location_field = None

    def get_permissions(self):
        perm_path = (
            "datechecks.create"
            if self.action in ("create", "batch", "update", "partial_update")
            else "datechecks.read"
        )
        return [
            IsAuthenticated(),
            LocationPermission(),
            PermissionRequired(perm_path)(),
        ]

    def get_serializer_class(self):
        if self.action in ("create", "batch"):
            return DateCheckEntryCreateSerializer
        if self.action in ("update", "partial_update"):
            return DateCheckEntryUpdateSerializer
        return DateCheckEntrySerializer

    def _get_date_check(self):
        check_id = self.kwargs.get("check_id")
        try:
            return DateCheck.objects.get(pk=check_id, location=self.location)
        except DateCheck.DoesNotExist as exc:
            raise NotFound("Date check not found.") from exc

    def get_queryset(self):
        date_check = self._get_date_check()
        return (
            DateCheckEntry.objects.filter(date_check=date_check)
            .select_related("stock_item", "menu_item")
            .order_by("earliest_expiry")
        )

    def _resolve_items(self, validated_data):
        organisation = self.location.organisation
        stock_item = None
        menu_item = None

        stock_item_id = validated_data.pop("stock_item_id", None)
        menu_item_id = validated_data.pop("menu_item_id", None)

        if stock_item_id:
            try:
                stock_item = StockItem.objects.get(
                    pk=stock_item_id,
                    organisation=organisation,
                    is_active=True,
                )
            except StockItem.DoesNotExist as exc:
                raise ValidationError({"stock_item_id": "Stock item not found."}) from exc

        if menu_item_id:
            try:
                menu_item = MenuItem.objects.get(
                    pk=menu_item_id,
                    organisation=organisation,
                    is_active=True,
                )
            except MenuItem.DoesNotExist as exc:
                raise ValidationError({"menu_item_id": "Menu item not found."}) from exc

        return stock_item, menu_item

    def _create_entry_from_validated(self, date_check, validated_data):
        data = dict(validated_data)
        stock_item, menu_item = self._resolve_items(data)
        try:
            return create_date_check_entry(
                date_check=date_check,
                stock_item=stock_item,
                menu_item=menu_item,
                product_name=validated_data.get("product_name", ""),
                earliest_expiry=validated_data["earliest_expiry"],
                quantity_at_risk=validated_data.get("quantity_at_risk", 1),
                unit=validated_data.get("unit", "units"),
                photo=validated_data.get("photo"),
                action_taken=validated_data.get(
                    "action_taken", DateCheckEntry.Action.NONE
                ),
                action_note=validated_data.get("action_note", ""),
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

    def create(self, request, *args, **kwargs):
        date_check = self._get_date_check()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = self._create_entry_from_validated(
            date_check, serializer.validated_data
        )
        return Response(
            DateCheckEntrySerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="batch")
    def batch(self, request, location_id=None, check_id=None):
        date_check = self._get_date_check()
        serializer = DateCheckEntryBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        created = []
        for item_data in serializer.validated_data["entries"]:
            entry = self._create_entry_from_validated(date_check, item_data)
            created.append(entry)

        return Response(
            DateCheckEntrySerializer(created, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        from datechecks.api.services import calculate_entry_cost

        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        if instance.date_check.status != DateCheck.Status.IN_PROGRESS:
            raise ValidationError(
                {"detail": "Cannot update entries on a completed date check."}
            )
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        schedule = get_or_create_schedule(self.location)
        instance.expiry_status = instance.compute_status(
            threshold_days=schedule.alert_threshold_days
        )
        instance.estimated_cost = calculate_entry_cost(
            location=self.location,
            stock_item=instance.stock_item,
            menu_item=instance.menu_item,
            quantity=instance.quantity_at_risk,
        )
        instance.save()
        return Response(DateCheckEntrySerializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        entry = self.get_object()
        if entry.date_check.status != DateCheck.Status.IN_PROGRESS:
            raise ValidationError(
                {"detail": "Cannot delete entries from a completed date check."}
            )
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExpiryAlertViewSet(LocationScopedMixin, viewsets.ReadOnlyModelViewSet):
    """Expiry alerts at /api/locations/{location_id}/expiry-alerts/."""

    queryset = ExpiryAlert.objects.all()
    serializer_class = ExpiryAlertSerializer
    pagination_class = DateCheckPagination

    def get_permissions(self):
        permission_map = {
            "resolve": "datechecks.resolve_alerts",
            "bulk_resolve": "datechecks.resolve_alerts",
        }
        perm_path = permission_map.get(self.action, "datechecks.read")
        return [
            IsAuthenticated(),
            LocationPermission(),
            PermissionRequired(perm_path)(),
        ]

    def get_queryset(self):
        qs = (
            super()
            .get_queryset()
            .select_related("resolved_by", "date_check_entry")
            .order_by("expiry_date", "-alert_level")
        )
        params = self.request.query_params
        alert_level = params.get("alert_level")
        if alert_level:
            qs = qs.filter(alert_level=alert_level)
        resolution = params.get("resolution", ExpiryAlert.Resolution.PENDING)
        if resolution:
            qs = qs.filter(resolution=resolution)
        return qs

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request, location_id=None):
        pending = ExpiryAlert.objects.filter(
            location=self.location,
            resolution=ExpiryAlert.Resolution.PENDING,
        )
        aggregates = pending.aggregate(
            total_cost=Sum("estimated_cost"),
        )
        return Response(
            {
                "expired": pending.filter(
                    alert_level=ExpiryAlert.AlertLevel.EXPIRED
                ).count(),
                "critical": pending.filter(
                    alert_level=ExpiryAlert.AlertLevel.CRITICAL
                ).count(),
                "warning": pending.filter(
                    alert_level=ExpiryAlert.AlertLevel.WARNING
                ).count(),
                "total_cost_at_risk": aggregates["total_cost"] or 0,
            }
        )

    @action(detail=True, methods=["put"], url_path="resolve")
    def resolve(self, request, location_id=None, pk=None):
        alert = self.get_object()
        serializer = ExpiryAlertResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            alert = resolve_expiry_alert(
                alert=alert,
                resolution=data["resolution"],
                resolved_note=data.get("resolved_note", ""),
                resolved_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        log_activity(
            request,
            ActivityLog.ActionType.EXPIRY_ALERT_RESOLVED,
            organisation=self.location.organisation,
            location=self.location,
            target_model="ExpiryAlert",
            target_id=alert.id,
            details={
                "resolution": alert.resolution,
                "product_name": alert.product_name,
            },
        )
        return Response(ExpiryAlertSerializer(alert).data)

    @action(detail=False, methods=["post"], url_path="bulk-resolve")
    def bulk_resolve(self, request, location_id=None):
        serializer = ExpiryAlertBulkResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        alerts = list(
            ExpiryAlert.objects.filter(
                pk__in=data["alert_ids"],
                location=self.location,
                resolution=ExpiryAlert.Resolution.PENDING,
            )
        )
        if len(alerts) != len(data["alert_ids"]):
            raise ValidationError(
                {"alert_ids": "One or more alerts were not found or already resolved."}
            )

        resolved = []
        for alert in alerts:
            try:
                alert = resolve_expiry_alert(
                    alert=alert,
                    resolution=data["resolution"],
                    resolved_note=data.get("resolved_note", ""),
                    resolved_by=request.user,
                )
            except ValueError as exc:
                raise ValidationError(
                    {"detail": f"{alert.id}: {exc}"}
                ) from exc
            log_activity(
                request,
                ActivityLog.ActionType.EXPIRY_ALERT_RESOLVED,
                organisation=self.location.organisation,
                location=self.location,
                target_model="ExpiryAlert",
                target_id=alert.id,
                details={
                    "resolution": alert.resolution,
                    "bulk": True,
                },
            )
            resolved.append(alert)

        return Response(ExpiryAlertSerializer(resolved, many=True).data)


class DateCheckScheduleView(LocationScopedMixin, APIView):
    """GET/PUT /api/locations/{location_id}/date-check-schedule/."""

    def get_permissions(self):
        perm_path = (
            "datechecks.manage_schedule"
            if self.request.method == "PUT"
            else "datechecks.read"
        )
        return [
            IsAuthenticated(),
            LocationPermission(),
            PermissionRequired(perm_path)(),
        ]

    def get(self, request, location_id=None):
        schedule = get_or_create_schedule(self.location)
        return Response(DateCheckScheduleSerializer(schedule).data)

    def put(self, request, location_id=None):
        schedule = get_or_create_schedule(self.location)
        serializer = DateCheckScheduleUpdateSerializer(
            schedule, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        schedule.refresh_from_db()
        return Response(DateCheckScheduleSerializer(schedule).data)


class DateCheckScheduleStatusView(LocationScopedMixin, APIView):
    """GET /api/locations/{location_id}/date-check-schedule/status/."""

    def get_permissions(self):
        return [
            IsAuthenticated(),
            LocationPermission(),
            PermissionRequired("datechecks.read")(),
        ]

    def get(self, request, location_id=None):
        schedule = get_or_create_schedule(self.location)
        data = build_schedule_status(schedule)
        if data["last_check_at"]:
            data["last_check_at"] = timezone.localtime(
                data["last_check_at"]
            ).isoformat()
        if data["next_check_due"]:
            data["next_check_due"] = timezone.localtime(
                data["next_check_due"]
            ).isoformat()
        return Response(data)


class OrgDateCheckComplianceView(APIView):
    """GET /api/org/date-checks/compliance/ — owner-only cross-location summary."""

    permission_classes = [IsAuthenticated, IsOrgOwner]

    def get(self, request):
        org = request.user.organisation
        if org is None:
            return Response(
                {"detail": "No organisation associated with this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(build_org_compliance(org))
