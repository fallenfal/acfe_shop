from django.urls import path
from rest_framework.routers import DefaultRouter

from datechecks.api.views import (
    DateCheckEntryViewSet,
    DateCheckScheduleStatusView,
    DateCheckScheduleView,
    DateCheckViewSet,
    ExpiryAlertViewSet,
)

location_date_check_router = DefaultRouter()
location_date_check_router.register("", DateCheckViewSet, basename="date-check")

location_expiry_alert_router = DefaultRouter()
location_expiry_alert_router.register("", ExpiryAlertViewSet, basename="expiry-alert")

entry_list = DateCheckEntryViewSet.as_view({"get": "list", "post": "create"})
entry_batch = DateCheckEntryViewSet.as_view({"post": "batch"})
entry_detail = DateCheckEntryViewSet.as_view(
    {"put": "update", "patch": "partial_update", "delete": "destroy"}
)

urlpatterns = [
    path(
        "locations/<str:location_id>/date-checks/<uuid:check_id>/entries/",
        entry_list,
        name="date-check-entry-list",
    ),
    path(
        "locations/<str:location_id>/date-checks/<uuid:check_id>/entries/batch/",
        entry_batch,
        name="date-check-entry-batch",
    ),
    path(
        "locations/<str:location_id>/date-checks/<uuid:check_id>/entries/<uuid:pk>/",
        entry_detail,
        name="date-check-entry-detail",
    ),
    path(
        "locations/<str:location_id>/date-check-schedule/",
        DateCheckScheduleView.as_view(),
        name="date-check-schedule",
    ),
    path(
        "locations/<str:location_id>/date-check-schedule/status/",
        DateCheckScheduleStatusView.as_view(),
        name="date-check-schedule-status",
    ),
]
