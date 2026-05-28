from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from core.api.location_views import LocationViewSet
from core.api.views import LoginView, LogoutView, MeView
from inventory.api.views import LocationStockViewSet, OrgStockItemViewSet, StockTakeViewSet
from memos.api.views import MemoViewSet
from sales.api.views import OrgMenuItemViewSet, OrgSalesComparisonView, SaleViewSet
from waste.api.views import OrgWasteComparisonView, WasteEntryViewSet

from datechecks.api.urls import (
    location_date_check_router,
    location_expiry_alert_router,
    urlpatterns as datecheck_urlpatterns,
)
from datechecks.api.views import OrgDateCheckComplianceView
from training.api.urls import urlpatterns as training_urlpatterns

router = DefaultRouter()
router.register("locations", LocationViewSet, basename="location")

org_router = DefaultRouter()
org_router.register("stock-items", OrgStockItemViewSet, basename="org-stock-item")
org_router.register("menu-items", OrgMenuItemViewSet, basename="org-menu-item")

location_memo_router = DefaultRouter()
location_memo_router.register("", MemoViewSet, basename="memo")

location_stock_router = DefaultRouter()
location_stock_router.register("", LocationStockViewSet, basename="stock")

location_stock_take_router = DefaultRouter()
location_stock_take_router.register("", StockTakeViewSet, basename="stock-take")

location_waste_router = DefaultRouter()
location_waste_router.register("", WasteEntryViewSet, basename="waste")

location_sales_router = DefaultRouter()
location_sales_router.register("", SaleViewSet, basename="sale")

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("org/", include(org_router.urls)),
    path(
        "org/waste/comparison/",
        OrgWasteComparisonView.as_view(),
        name="org-waste-comparison",
    ),
    path(
        "org/sales/comparison/",
        OrgSalesComparisonView.as_view(),
        name="org-sales-comparison",
    ),
    path(
        "org/date-checks/compliance/",
        OrgDateCheckComplianceView.as_view(),
        name="org-date-check-compliance",
    ),
    path("", include(router.urls)),
    path("", include(datecheck_urlpatterns)),
    path("", include(training_urlpatterns)),
    path(
        "locations/<str:location_id>/memos/",
        include(location_memo_router.urls),
    ),
    path(
        "locations/<str:location_id>/stock/",
        include(location_stock_router.urls),
    ),
    path(
        "locations/<str:location_id>/stock-takes/",
        include(location_stock_take_router.urls),
    ),
    path(
        "locations/<str:location_id>/waste/",
        include(location_waste_router.urls),
    ),
    path(
        "locations/<str:location_id>/sales/",
        include(location_sales_router.urls),
    ),
    path(
        "locations/<str:location_id>/date-checks/",
        include(location_date_check_router.urls),
    ),
    path(
        "locations/<str:location_id>/expiry-alerts/",
        include(location_expiry_alert_router.urls),
    ),
]
