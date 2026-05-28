from django.urls import include, path
from rest_framework.routers import DefaultRouter

from training.api.views import (
    LocationTrainingProgrammeViewSet,
    OrgTrainingCommentViewSet,
    OrgTrainingHistoryView,
    OrgTrainingProgrammeViewSet,
    OrgTrainingStepViewSet,
    TrainingAssignableUsersView,
    TrainingAssignView,
    TrainingCompleteStepView,
    TrainingDashboardSummaryView,
    TrainingEnrolView,
    TrainingEnrolmentListView,
    TrainingOverviewView,
    TrainingProgressView,
    TrainingUncompleteStepView,
)

location_training_router = DefaultRouter()
location_training_router.register(
    "", LocationTrainingProgrammeViewSet, basename="location-training"
)

org_training_router = DefaultRouter()
org_training_router.register("", OrgTrainingProgrammeViewSet, basename="org-training")

step_list = OrgTrainingStepViewSet.as_view({"get": "list", "post": "create"})
step_detail = OrgTrainingStepViewSet.as_view(
    {"put": "update", "delete": "destroy"}
)
step_reorder = OrgTrainingStepViewSet.as_view({"post": "reorder"})

comment_list = OrgTrainingCommentViewSet.as_view({"get": "list", "post": "create"})

urlpatterns = [
    path("org/training/history/", OrgTrainingHistoryView.as_view(), name="org-training-history"),
    path("org/training/", include(org_training_router.urls)),
    path(
        "org/training/<uuid:programme_id>/steps/",
        step_list,
        name="org-training-step-list",
    ),
    path(
        "org/training/<uuid:programme_id>/steps/reorder/",
        step_reorder,
        name="org-training-step-reorder",
    ),
    path(
        "org/training/<uuid:programme_id>/steps/<uuid:id>/",
        step_detail,
        name="org-training-step-detail",
    ),
    path(
        "org/training/<uuid:programme_id>/comments/",
        comment_list,
        name="org-training-comment-list",
    ),
    path(
        "locations/<str:location_id>/training/dashboard-summary/",
        TrainingDashboardSummaryView.as_view(),
        name="location-training-dashboard-summary",
    ),
    path(
        "locations/<str:location_id>/training/overview/",
        TrainingOverviewView.as_view(),
        name="location-training-overview",
    ),
    path(
        "locations/<str:location_id>/training/assignable-users/",
        TrainingAssignableUsersView.as_view(),
        name="location-training-assignable-users",
    ),
    path(
        "locations/<str:location_id>/training/<uuid:programme_id>/enrol/",
        TrainingEnrolView.as_view(),
        name="location-training-enrol",
    ),
    path(
        "locations/<str:location_id>/training/<uuid:programme_id>/assign/",
        TrainingAssignView.as_view(),
        name="location-training-assign",
    ),
    path(
        "locations/<str:location_id>/training/<uuid:programme_id>/progress/",
        TrainingProgressView.as_view(),
        name="location-training-progress",
    ),
    path(
        "locations/<str:location_id>/training/<uuid:programme_id>/enrolments/",
        TrainingEnrolmentListView.as_view(),
        name="location-training-enrolments",
    ),
    path(
        "locations/<str:location_id>/training/<uuid:programme_id>/steps/<uuid:step_id>/complete/",
        TrainingCompleteStepView.as_view(),
        name="location-training-step-complete",
    ),
    path(
        "locations/<str:location_id>/training/<uuid:programme_id>/steps/<uuid:step_id>/uncomplete/",
        TrainingUncompleteStepView.as_view(),
        name="location-training-step-uncomplete",
    ),
    path(
        "locations/<str:location_id>/training/",
        include(location_training_router.urls),
    ),
]
