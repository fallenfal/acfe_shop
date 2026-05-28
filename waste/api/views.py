from datetime import timedelta

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from activity.models import ActivityLog
from activity.services import log_activity
from core.mixins import LocationScopedMixin
from core.permissions import (
    LocationPermission,
    PermissionRequired,
    user_is_cm_or_above,
    user_is_org_owner,
)
from waste.api.analytics import (
    build_org_waste_comparison,
    build_waste_summary,
    build_waste_trends,
    resolve_period_range,
)
from waste.api.pagination import WastePagination
from waste.api.serializers import WasteEntryCreateSerializer, WasteEntrySerializer
from waste.api.services import create_waste_entry, delete_waste_entry
from waste.models import WasteEntry


class IsOrgOwner(BasePermission):
    message = "Only organisation owners may access this endpoint."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return user_is_org_owner(
            request.user, getattr(request.user, "organisation", None)
        )


class WasteEntryViewSet(LocationScopedMixin, viewsets.ModelViewSet):
    queryset = WasteEntry.objects.all()
    serializer_class = WasteEntrySerializer
    pagination_class = WastePagination
    http_method_names = ["get", "head", "options", "post", "delete"]

    def get_permissions(self):
        permission_map = {
            "list": "waste.read",
            "retrieve": "waste.read",
            "create": "waste.create",
            "destroy": "waste.read",
            "summary": "waste.view_reports",
            "trends": "waste.view_reports",
        }
        perm_path = permission_map.get(self.action, "waste.read")
        return [
            IsAuthenticated(),
            LocationPermission(),
            PermissionRequired(perm_path)(),
        ]

    def get_serializer_class(self):
        if self.action == "create":
            return WasteEntryCreateSerializer
        return WasteEntrySerializer

    def get_queryset(self):
        qs = (
            super()
            .get_queryset()
            .select_related("menu_item", "stock_item", "logged_by", "location")
        )
        if self.action in ("list",):
            qs = self._apply_list_filters(qs)
        return qs.order_by("-logged_at")

    def _apply_list_filters(self, queryset):
        params = self.request.query_params
        date_from = params.get("date_from")
        date_to = params.get("date_to")
        if date_from:
            queryset = queryset.filter(logged_at__date__gte=date_from[:10])
        if date_to:
            queryset = queryset.filter(logged_at__date__lte=date_to[:10])
        reason = params.get("reason")
        if reason:
            queryset = queryset.filter(reason=reason)
        shift = params.get("shift")
        if shift:
            queryset = queryset.filter(shift=shift)
        item_type = params.get("item_type")
        if item_type:
            queryset = queryset.filter(item_type=item_type)
        reason_group = params.get("reason_group")
        if reason_group == "expired":
            queryset = queryset.filter(reason=WasteEntry.Reason.EXPIRED)
        elif reason_group == "other":
            queryset = queryset.exclude(reason=WasteEntry.Reason.EXPIRED)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        menu_item, stock_item = serializer.resolve_items(self.location)
        data = serializer.validated_data

        try:
            entry = create_waste_entry(
                location=self.location,
                item_type=data["item_type"],
                menu_item=menu_item,
                stock_item=stock_item,
                quantity=data["quantity"],
                unit=data["unit"],
                reason=data["reason"],
                reason_note=data.get("reason_note", ""),
                shift=data["shift"],
                photo=data.get("photo"),
                logged_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        log_activity(
            request,
            ActivityLog.ActionType.WASTE_LOGGED,
            organisation=self.location.organisation,
            location=self.location,
            target_model="WasteEntry",
            target_id=entry.id,
            details={
                "item_type": entry.item_type,
                "quantity": entry.quantity,
                "reason": entry.reason,
                "cost_value": str(entry.cost_value),
                "menu_item_id": str(menu_item.id) if menu_item else None,
                "stock_item_id": str(stock_item.id) if stock_item else None,
            },
        )

        return Response(
            WasteEntrySerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        entry = self.get_object()
        if not user_is_cm_or_above(request.user, self.location):
            raise PermissionDenied(
                "Only content managers and owners may delete waste entries."
            )
        age = timezone.now() - entry.logged_at
        if age > timedelta(hours=24):
            raise PermissionDenied(
                "Waste entries can only be deleted within 24 hours of logging."
            )

        entry_id = entry.id
        cost_value = str(entry.cost_value)
        delete_waste_entry(entry)

        log_activity(
            request,
            ActivityLog.ActionType.WASTE_LOGGED,
            organisation=self.location.organisation,
            location=self.location,
            target_model="WasteEntry",
            target_id=entry_id,
            details={"action": "waste_entry_deleted", "cost_value": cost_value},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request, location_id=None):
        start_dt, end_dt = resolve_period_range(request)
        data = build_waste_summary(
            self.location,
            WasteEntry.objects.filter(location=self.location),
            start_dt,
            end_dt,
        )
        return Response(data)

    @action(detail=False, methods=["get"], url_path="trends")
    def trends(self, request, location_id=None):
        params = request.query_params
        if params.get("date_from") or params.get("date_to"):
            start_dt, end_dt = resolve_period_range(request)
            data = build_waste_trends(
                self.location,
                WasteEntry.objects.filter(location=self.location),
                start_dt=start_dt,
                end_dt=end_dt,
            )
        else:
            try:
                days = int(params.get("days", 30))
            except (TypeError, ValueError):
                days = 30
            data = build_waste_trends(
                self.location,
                WasteEntry.objects.filter(location=self.location),
                days=days,
            )
        return Response(data)


class OrgWasteComparisonView(APIView):
    """GET /api/org/waste/comparison/ — cross-location waste comparison (owners)."""

    permission_classes = [IsAuthenticated, IsOrgOwner]

    def get(self, request):
        org = request.user.organisation
        if org is None:
            return Response(
                {"detail": "No organisation associated with this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        start_dt, end_dt = resolve_period_range(request)
        data = build_org_waste_comparison(org, start_dt, end_dt)
        return Response(data)
