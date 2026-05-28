from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from activity.models import ActivityLog
from activity.services import log_activity
from core.mixins import LocationScopedMixin
from core.models import User, UserLocationRole
from core.permissions import (
    LocationPermission,
    PermissionRequired,
    user_is_cm_or_above,
)
from inventory.api.views import IsCmOrAboveInOrg
from training.api.permissions import OrgPermissionRequired
from training.api.pagination import TrainingHistoryPagination
from training.api.serializers import (
    AssignEnrolmentSerializer,
    CompleteStepSerializer,
    EnrolmentSerializer,
    ProgrammeCreateUpdateSerializer,
    ProgrammeDetailSerializer,
    ProgrammeHistorySerializer,
    ProgrammeListSerializer,
    ProgrammeOverviewItemSerializer,
    ProgressStepSerializer,
    StepCompletionSerializer,
    StepReorderSerializer,
    TrainingCommentCreateSerializer,
    TrainingCommentSerializer,
    TrainingStepCreateSerializer,
    TrainingStepSerializer,
    TrainingStepUpdateSerializer,
)
from training.api.services import (
    create_training_publish_memos,
    get_org_programme,
    get_programme_for_location,
    next_step_order,
    programmes_for_location,
    reorder_steps,
    reorder_steps_after_delete,
    staff_mandatory_compliance,
)
from training.models import (
    StepCompletion,
    TrainingComment,
    TrainingEnrolment,
    TrainingProgramme,
    TrainingStep,
)


def _log_training(request, action_type, *, organisation, location=None, programme=None, details=None):
    log_activity(
        request,
        action_type,
        organisation=organisation,
        location=location,
        target_model="TrainingProgramme",
        target_id=programme.id if programme else None,
        details=details or {},
    )


class LocationTrainingProgrammeViewSet(
    LocationScopedMixin, mixins.ListModelMixin, viewsets.GenericViewSet
):
    """GET /api/locations/{location_id}/training/ — programmes for this location."""

    serializer_class = ProgrammeListSerializer
    pagination_class = None

    def get_permissions(self):
        return [
            IsAuthenticated(),
            LocationPermission(),
            PermissionRequired("training.read")(),
        ]

    def get_queryset(self):
        if self.location is None:
            return TrainingProgramme.objects.none()

        status_param = self.request.query_params.get(
            "status", TrainingProgramme.Status.PUBLISHED
        )
        qs = programmes_for_location(self.location).prefetch_related("steps")
        if status_param:
            qs = qs.filter(status=status_param)
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        is_mandatory = self.request.query_params.get("is_mandatory")
        if is_mandatory is not None and is_mandatory != "":
            qs = qs.filter(is_mandatory=is_mandatory.lower() in ("true", "1", "yes"))

        qs = qs.annotate(
            step_count=Count("steps", distinct=True),
            enrolment_count=Count(
                "enrolments",
                filter=Q(enrolments__location=self.location),
                distinct=True,
            ),
        ).order_by("-created_at")
        return qs

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.location and self.request.user.is_authenticated:
            enrolments = TrainingEnrolment.objects.filter(
                user=self.request.user,
                location=self.location,
                programme_id__in=self.get_queryset().values_list("pk", flat=True),
            )
            context["user_enrolments"] = {
                str(e.programme_id): e for e in enrolments
            }
        else:
            context["user_enrolments"] = {}
        return context


class OrgTrainingProgrammeViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Org-level programme CRUD at /api/org/training/."""

    lookup_field = "pk"
    lookup_url_kwarg = "id"
    http_method_names = ["get", "head", "options", "post", "put", "delete"]

    def get_permissions(self):
        if self.action == "list":
            return [
                IsAuthenticated(),
                IsCmOrAboveInOrg(),
                OrgPermissionRequired("training.read"),
            ]
        if self.action in ("retrieve",):
            return [
                IsAuthenticated(),
                IsCmOrAboveInOrg(),
                OrgPermissionRequired("training.read"),
            ]
        if self.action == "destroy":
            return [
                IsAuthenticated(),
                IsCmOrAboveInOrg(),
                OrgPermissionRequired("training.delete"),
            ]
        if self.action in ("publish", "archive"):
            return [
                IsAuthenticated(),
                IsCmOrAboveInOrg(),
                OrgPermissionRequired("training.update"),
            ]
        return [
            IsAuthenticated(),
            IsCmOrAboveInOrg(),
            OrgPermissionRequired(
                "training.create" if self.action == "create" else "training.update"
            ),
        ]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ProgrammeDetailSerializer
        if self.action == "list":
            return ProgrammeListSerializer
        return ProgrammeCreateUpdateSerializer

    def get_queryset(self):
        org = self.request.user.organisation
        if org is None:
            return TrainingProgramme.objects.none()
        qs = (
            TrainingProgramme.objects.filter(organisation=org)
            .prefetch_related("steps", "locations")
            .annotate(
                step_count=Count("steps", distinct=True),
                enrolment_count=Count("enrolments", distinct=True),
            )
        )
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        return qs.order_by("-created_at")

    def get_object(self):
        return get_object_or_404(self.get_queryset(), pk=self.kwargs["id"])

    @transaction.atomic
    def perform_create(self, serializer):
        org = self.request.user.organisation
        programme = serializer.save()
        TrainingStep.objects.create(
            programme=programme,
            order=1,
            title="Step 1",
            description="",
        )
        _log_training(
            self.request,
            ActivityLog.ActionType.TRAINING_CREATED,
            organisation=org,
            programme=programme,
            details={"title": programme.title},
        )

    def perform_update(self, serializer):
        programme = self.get_object()
        if programme.status == TrainingProgramme.Status.ARCHIVED:
            raise ValidationError("Archived programmes cannot be edited.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        programme = self.get_object()
        if programme.status != TrainingProgramme.Status.DRAFT:
            raise ValidationError("Only draft programmes can be deleted.")
        programme.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = ProgrammeDetailSerializer(
            instance, context=self.get_serializer_context()
        )
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, id=None):
        programme = self.get_object()
        if programme.status != TrainingProgramme.Status.DRAFT:
            raise ValidationError("Only draft programmes can be published.")
        if programme.step_count < 1:
            raise ValidationError("Programme must have at least one step to publish.")
        programme.publish()
        memo_count = create_training_publish_memos(programme, request.user)
        _log_training(
            request,
            ActivityLog.ActionType.TRAINING_PUBLISHED,
            organisation=programme.organisation,
            programme=programme,
            details={"title": programme.title, "memos_created": memo_count},
        )
        return Response(
            ProgrammeDetailSerializer(programme, context={"request": request}).data
        )

    @action(detail=True, methods=["post"], url_path="archive")
    def archive(self, request, id=None):
        programme = self.get_object()
        if programme.status == TrainingProgramme.Status.ARCHIVED:
            raise ValidationError("Programme is already archived.")
        programme.archive()
        _log_training(
            request,
            ActivityLog.ActionType.TRAINING_ARCHIVED,
            organisation=programme.organisation,
            programme=programme,
            details={"title": programme.title},
        )
        return Response(ProgrammeDetailSerializer(programme, context={"request": request}).data)


class OrgTrainingHistoryView(APIView):
    """GET /api/org/training/history/ — published and archived programmes."""

    permission_classes = [
        IsAuthenticated,
        IsCmOrAboveInOrg,
        OrgPermissionRequired("training.read"),
    ]
    pagination_class = TrainingHistoryPagination

    def get(self, request):
        org = request.user.organisation
        if org is None:
            return Response({"results": [], "count": 0})

        qs = (
            TrainingProgramme.objects.filter(
                organisation=org,
                status__in=[
                    TrainingProgramme.Status.PUBLISHED,
                    TrainingProgramme.Status.ARCHIVED,
                ],
            )
            .annotate(
                step_count=Count("steps", distinct=True),
                enrolment_count=Count("enrolments", distinct=True),
                completed_count=Count(
                    "enrolments",
                    filter=Q(enrolments__status=TrainingEnrolment.Status.COMPLETED),
                    distinct=True,
                ),
            )
            .order_by("-published_at", "-created_at")
        )

        status_param = request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        category = request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request)
        serializer = ProgrammeHistorySerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)


class OrgTrainingStepViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Steps nested under /api/org/training/{programme_id}/steps/."""

    lookup_field = "pk"
    lookup_url_kwarg = "id"
    http_method_names = ["get", "head", "options", "post", "put", "delete"]

    def get_permissions(self):
        perm = "training.read" if self.action == "list" else "training.update"
        return [
            IsAuthenticated(),
            IsCmOrAboveInOrg(),
            OrgPermissionRequired(perm),
        ]

    def get_programme(self):
        programme = get_org_programme(self.request.user, self.kwargs["programme_id"])
        if programme is None:
            raise NotFound("Programme not found.")
        if programme.status == TrainingProgramme.Status.ARCHIVED:
            if self.action not in ("list",):
                raise ValidationError("Archived programmes cannot be edited.")
        return programme

    def get_queryset(self):
        return self.get_programme().steps.order_by("order")

    def get_serializer_class(self):
        if self.action == "create":
            return TrainingStepCreateSerializer
        if self.action in ("update", "partial_update"):
            return TrainingStepUpdateSerializer
        return TrainingStepSerializer

    def list(self, request, programme_id=None):
        steps = self.get_queryset()
        return Response(
            TrainingStepSerializer(steps, many=True, context={"request": request}).data
        )

    def create(self, request, programme_id=None):
        programme = self.get_programme()
        serializer = TrainingStepCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        step = serializer.save(programme=programme, order=next_step_order(programme))
        return Response(
            TrainingStepSerializer(step, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, programme_id=None, id=None):
        step = get_object_or_404(self.get_queryset(), pk=id)
        serializer = TrainingStepUpdateSerializer(
            step, data=request.data, partial=False, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            TrainingStepSerializer(step, context={"request": request}).data
        )

    def destroy(self, request, programme_id=None, id=None):
        programme = self.get_programme()
        step = get_object_or_404(programme.steps, pk=id)
        step.delete()
        reorder_steps_after_delete(programme)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def reorder(self, request, programme_id=None):
        programme = self.get_programme()
        serializer = StepReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        step_ids = [str(sid) for sid in serializer.validated_data["step_ids"]]
        try:
            reorder_steps(programme, step_ids)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
        steps = programme.steps.order_by("order")
        return Response(
            TrainingStepSerializer(steps, many=True, context={"request": request}).data
        )


class OrgTrainingCommentViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Comments at /api/org/training/{programme_id}/comments/."""

    serializer_class = TrainingCommentSerializer
    http_method_names = ["get", "head", "options", "post"]

    def get_permissions(self):
        return [
            IsAuthenticated(),
            OrgPermissionRequired("training.read"),
        ]

    def get_programme(self):
        programme = get_org_programme(self.request.user, self.kwargs["programme_id"])
        if programme is None:
            raise NotFound("Programme not found.")
        return programme

    def get_queryset(self):
        programme = self.get_programme()
        qs = programme.comments.select_related("user", "step").order_by("created_at")
        step_id = self.request.query_params.get("step_id")
        if step_id:
            qs = qs.filter(step_id=step_id)
        return qs

    def create(self, request, programme_id=None):
        programme = self.get_programme()
        serializer = TrainingCommentCreateSerializer(
            data=request.data,
            context={"programme": programme, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        step_id = serializer.validated_data.pop("step_id", None)
        comment = TrainingComment.objects.create(
            programme=programme,
            user=request.user,
            step_id=step_id,
            **serializer.validated_data,
        )
        return Response(
            TrainingCommentSerializer(comment).data,
            status=status.HTTP_201_CREATED,
        )


class LocationTrainingActionMixin(LocationScopedMixin):
    """Shared location scope for programme-scoped training actions."""

    def get_programme(self):
        if self.location is None:
            raise NotFound("Location not found.")
        programme = get_programme_for_location(
            self.location, self.kwargs["programme_id"]
        )
        if programme is None:
            raise NotFound("Programme not found.")
        return programme


class TrainingEnrolView(LocationTrainingActionMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        LocationPermission,
        PermissionRequired("training.complete"),
    ]

    def post(self, request, location_id=None, programme_id=None):
        programme = self.get_programme()
        if programme.status != TrainingProgramme.Status.PUBLISHED:
            raise ValidationError("Only published programmes can be enrolled in.")
        enrolment, created = TrainingEnrolment.objects.get_or_create(
            programme=programme,
            user=request.user,
            location=self.location,
            defaults={"status": TrainingEnrolment.Status.NOT_STARTED},
        )
        if created:
            _log_training(
                request,
                ActivityLog.ActionType.TRAINING_ENROLLED,
                organisation=programme.organisation,
                location=self.location,
                programme=programme,
                details={"user_id": str(request.user.id)},
            )
        return Response(
            EnrolmentSerializer(enrolment, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class TrainingAssignView(LocationTrainingActionMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        LocationPermission,
        PermissionRequired("training.assign"),
    ]

    def post(self, request, location_id=None, programme_id=None):
        programme = self.get_programme()
        if programme.status == TrainingProgramme.Status.ARCHIVED:
            raise ValidationError("Cannot assign enrolments to archived programmes.")
        serializer = AssignEnrolmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_ids = serializer.validated_data["user_ids"]
        valid_users = User.objects.filter(
            pk__in=user_ids,
            organisation=programme.organisation,
            is_active=True,
        )
        valid_ids = {u.id for u in valid_users}
        for uid in user_ids:
            if uid not in valid_ids:
                raise ValidationError(f"User {uid} is not a valid org member.")

        created_enrolments = []
        for user in valid_users:
            if not UserLocationRole.objects.filter(
                user=user, location=self.location
            ).exists():
                raise ValidationError(
                    f"User {user.id} does not have a role at this location."
                )
            enrolment, created = TrainingEnrolment.objects.get_or_create(
                programme=programme,
                user=user,
                location=self.location,
                defaults={
                    "status": TrainingEnrolment.Status.NOT_STARTED,
                    "assigned_by": request.user,
                },
            )
            if created:
                created_enrolments.append(enrolment)
                _log_training(
                    request,
                    ActivityLog.ActionType.TRAINING_ENROLLED,
                    organisation=programme.organisation,
                    location=self.location,
                    programme=programme,
                    details={"user_id": str(user.id), "assigned": True},
                )

        return Response(
            EnrolmentSerializer(
                created_enrolments, many=True, context={"request": request}
            ).data,
            status=status.HTTP_201_CREATED,
        )


class TrainingProgressView(LocationTrainingActionMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        LocationPermission,
        PermissionRequired("training.read"),
    ]

    def get(self, request, location_id=None, programme_id=None):
        programme = self.get_programme()
        try:
            enrolment = TrainingEnrolment.objects.get(
                programme=programme,
                user=request.user,
                location=self.location,
            )
        except TrainingEnrolment.DoesNotExist:
            raise NotFound("You are not enrolled in this programme.")

        steps = programme.steps.order_by("order")
        completions = enrolment.step_completions.select_related("step").order_by(
            "step__order"
        )
        completed_ids = {str(c.step_id) for c in completions}

        data = {
            "enrolment": EnrolmentSerializer(
                enrolment, context={"request": request}
            ).data,
            "steps": ProgressStepSerializer(
                steps,
                many=True,
                context={"request": request, "completed_step_ids": completed_ids},
            ).data,
            "completions": StepCompletionSerializer(completions, many=True).data,
        }
        return Response(data)


class TrainingCompleteStepView(LocationTrainingActionMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        LocationPermission,
        PermissionRequired("training.complete"),
    ]

    def post(self, request, location_id=None, programme_id=None, step_id=None):
        programme = self.get_programme()
        if programme.status != TrainingProgramme.Status.PUBLISHED:
            raise ValidationError("Cannot complete steps on unpublished programmes.")
        step = get_object_or_404(programme.steps, pk=step_id)

        enrolment, _ = TrainingEnrolment.objects.get_or_create(
            programme=programme,
            user=request.user,
            location=self.location,
            defaults={"status": TrainingEnrolment.Status.NOT_STARTED},
        )

        serializer = CompleteStepSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if step.requires_acknowledgement and not data.get("acknowledged"):
            raise ValidationError(
                {"acknowledged": "Acknowledgement is required for this step."}
            )

        completed_orders = set(
            enrolment.step_completions.values_list("step__order", flat=True)
        )
        next_order = max(completed_orders, default=0) + 1
        if step.order != next_order:
            raise ValidationError(
                f"Complete step {next_order} before step {step.order}."
            )

        was_completed = enrolment.status == TrainingEnrolment.Status.COMPLETED
        completion, created = StepCompletion.objects.get_or_create(
            enrolment=enrolment,
            step=step,
            defaults={
                "acknowledged": data.get("acknowledged", False),
                "notes": data.get("notes", ""),
            },
        )
        if not created:
            completion.acknowledged = data.get("acknowledged", False)
            completion.notes = data.get("notes", "")
            completion.save(update_fields=["acknowledged", "notes"])

        enrolment.update_status()

        _log_training(
            request,
            ActivityLog.ActionType.TRAINING_STEP_COMPLETED,
            organisation=programme.organisation,
            location=self.location,
            programme=programme,
            details={
                "step_id": str(step.id),
                "step_order": step.order,
                "user_id": str(request.user.id),
            },
        )

        if (
            not was_completed
            and enrolment.status == TrainingEnrolment.Status.COMPLETED
        ):
            _log_training(
                request,
                ActivityLog.ActionType.TRAINING_COMPLETED,
                organisation=programme.organisation,
                location=self.location,
                programme=programme,
                details={"user_id": str(request.user.id)},
            )

        return Response(
            StepCompletionSerializer(completion).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class TrainingUncompleteStepView(LocationTrainingActionMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        LocationPermission,
        PermissionRequired("training.read"),
    ]

    def post(self, request, location_id=None, programme_id=None, step_id=None):
        if not user_is_cm_or_above(request.user, self.location):
            raise PermissionDenied("Only content managers and owners may undo completions.")

        programme = self.get_programme()
        step = get_object_or_404(programme.steps, pk=step_id)
        target_user_id = request.data.get("user_id") or request.user.id
        enrolment = get_object_or_404(
            TrainingEnrolment,
            programme=programme,
            location=self.location,
            user_id=target_user_id,
        )

        deleted, _ = StepCompletion.objects.filter(
            enrolment=enrolment, step=step
        ).delete()
        if deleted:
            enrolment.update_status()

        return Response(status=status.HTTP_204_NO_CONTENT)


class TrainingEnrolmentListView(LocationTrainingActionMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        LocationPermission,
        PermissionRequired("training.read"),
    ]

    def get(self, request, location_id=None, programme_id=None):
        if not user_is_cm_or_above(request.user, self.location):
            raise PermissionDenied("Only content managers and owners may view enrolments.")

        programme = self.get_programme()
        qs = (
            TrainingEnrolment.objects.filter(programme=programme, location=self.location)
            .select_related("user", "programme")
            .order_by("-created_at")
        )
        status_param = request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        return Response(
            EnrolmentSerializer(qs, many=True, context={"request": request}).data
        )


class TrainingAssignableUsersView(LocationTrainingActionMixin, APIView):
    """Staff at this location who can be assigned to training."""

    permission_classes = [
        IsAuthenticated,
        LocationPermission,
        PermissionRequired("training.assign"),
    ]

    def get(self, request, location_id=None):
        from training.api.serializers import build_media_url

        users = (
            User.objects.filter(
                user_location_roles__location=self.location,
                is_active=True,
            )
            .distinct()
            .order_by("first_name", "last_name", "username")
        )
        return Response(
            [
                {
                    "id": str(u.id),
                    "name": u.get_full_name() or u.username,
                    "avatar": build_media_url(request, u.avatar),
                }
                for u in users
            ]
        )


class TrainingDashboardSummaryView(LocationTrainingActionMixin, APIView):
    """Mandatory training compliance summary for the sales dashboard widget."""

    permission_classes = [
        IsAuthenticated(),
        LocationPermission(),
        PermissionRequired("training.read")(),
    ]

    def get(self, request, location_id=None):
        summary = staff_mandatory_compliance(self.location)
        return Response(summary)


class TrainingOverviewView(LocationTrainingActionMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        LocationPermission,
        PermissionRequired("training.read"),
    ]

    def get(self, request, location_id=None):
        if not user_is_cm_or_above(request.user, self.location):
            raise PermissionDenied("Only content managers and owners may view the overview.")

        programmes = programmes_for_location(self.location).filter(
            status=TrainingProgramme.Status.PUBLISHED
        )
        total_staff = UserLocationRole.objects.filter(location=self.location).count()

        items = []
        for programme in programmes:
            enrolments = TrainingEnrolment.objects.filter(
                programme=programme, location=self.location
            )
            enrolled_count = enrolments.count()
            completed_count = enrolments.filter(
                status=TrainingEnrolment.Status.COMPLETED
            ).count()
            completion_rate = 0.0
            if total_staff > 0:
                completion_rate = round((completed_count / total_staff) * 100, 1)

            items.append(
                {
                    "id": programme.id,
                    "title": programme.title,
                    "category": programme.category,
                    "total_staff": total_staff,
                    "enrolled_count": enrolled_count,
                    "completed_count": completed_count,
                    "completion_rate": completion_rate,
                }
            )

        return Response(ProgrammeOverviewItemSerializer(items, many=True).data)
