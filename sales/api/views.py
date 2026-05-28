from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from activity.models import ActivityLog
from activity.services import log_activity
from core.mixins import LocationScopedMixin
from core.permissions import LocationPermission, PermissionRequired
from sales.api.analytics import (
    build_dashboard,
    build_dashboard_aggregated,
    build_org_sales_comparison,
    build_product_performance_for_locations,
    build_trends_for_locations,
    parse_date,
    resolve_trends_period,
)
from sales.api.menu_serializers import MenuItemListSerializer
from sales.api.serializers import SaleSerializer
from sales.api.services import import_sales_csv
from sales.models import MenuItem, Sale
from waste.api.analytics import resolve_period_range
from waste.api.views import IsOrgOwner


class OrgMenuItemViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Org catalogue for waste logging and other flows."""

    serializer_class = MenuItemListSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        org = self.request.user.organisation
        if org is None:
            return MenuItem.objects.none()
        return MenuItem.objects.filter(organisation=org, is_active=True).order_by(
            "category", "name"
        )


class SaleViewSet(LocationScopedMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = SaleSerializer
    queryset = Sale.objects.all()

    def get_permissions(self):
        permission_map = {
            "list": "sales.view_dashboard",
            "retrieve": "sales.view_dashboard",
            "dashboard": "sales.view_dashboard",
            "trends": "sales.view_dashboard",
            "product_performance": "sales.view_financials",
            "import_sales": "sales.view_financials",
        }
        perm_path = permission_map.get(self.action, "sales.view_dashboard")
        return [
            IsAuthenticated(),
            LocationPermission(),
            PermissionRequired(perm_path)(),
        ]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .prefetch_related("items__menu_item")
            .select_related("location")
        )

    def _location_ids_for_scope(self):
        if self.all_locations:
            return list(self.request.user.get_locations().values_list("pk", flat=True))
        return [self.location.pk]

    @action(detail=False, methods=["get"], url_path="dashboard")
    def dashboard(self, request, location_id=None):
        target_date = parse_date(
            request.query_params.get("date"),
            default=timezone.localdate(),
        )
        if self.all_locations:
            locations = list(request.user.get_locations())
            data = build_dashboard_aggregated(locations, target_date)
        else:
            data = build_dashboard(self.location, target_date)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="trends")
    def trends(self, request, location_id=None):
        days = resolve_trends_period(request)
        location_ids = self._location_ids_for_scope()
        data = build_trends_for_locations(location_ids, days)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="product-performance")
    def product_performance(self, request, location_id=None):
        params = request.query_params
        date_from = parse_date(params.get("date_from"))
        date_to = parse_date(params.get("date_to"))
        if date_from is None or date_to is None:
            raise ValidationError(
                {"detail": "date_from and date_to query parameters are required."}
            )
        if date_from > date_to:
            date_from, date_to = date_to, date_from
        category = params.get("category") or None
        if category and category not in MenuItem.Category.values:
            raise ValidationError({"category": f"Invalid category: {category}"})
        location_ids = self._location_ids_for_scope()
        data = build_product_performance_for_locations(
            location_ids, date_from, date_to, category=category
        )
        return Response(data)

    @action(
        detail=False,
        methods=["post"],
        url_path="import",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_sales(self, request, location_id=None):
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "CSV file is required (field name: file)."})

        result = import_sales_csv(self.location, upload)

        log_activity(
            request,
            ActivityLog.ActionType.SALE_IMPORTED,
            organisation=self.location.organisation,
            location=self.location,
            target_model="Sale",
            details={
                "rows_processed": result["rows_processed"],
                "sales_created": result["sales_created"],
                "revenue_imported": result["revenue_imported"],
                "error_count": len(result["errors"]),
            },
        )

        return Response(result, status=status.HTTP_201_CREATED)


class OrgSalesComparisonView(APIView):
    """GET /api/org/sales/comparison/ — cross-location revenue comparison (owners)."""

    permission_classes = [IsAuthenticated, IsOrgOwner]

    def get(self, request):
        org = request.user.organisation
        if org is None:
            return Response(
                {"detail": "No organisation associated with this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        start_dt, end_dt = resolve_period_range(request)
        data = build_org_sales_comparison(org, start_dt, end_dt)
        return Response(data)
