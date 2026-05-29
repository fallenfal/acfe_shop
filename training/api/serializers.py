from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F
from rest_framework import serializers

from core.media_urls import absolute_media_url
from training.models import (
    StepCompletion,
    TrainingComment,
    TrainingEnrolment,
    TrainingProgramme,
    TrainingStep,
)


def build_media_url(request, field):
    """Prefer PUBLIC_BASE_URL; fall back to request host for local dev."""
    url = absolute_media_url(field)
    if url or field is None:
        return url
    if request is None:
        return None
    try:
        return request.build_absolute_uri(field.url)
    except Exception:
        return field.url


def programme_step_count(obj) -> int:
    """Use queryset annotation when present; avoid annotating as step_count (model property)."""
    total = getattr(obj, "steps_total", None)
    if total is not None:
        return int(total)
    return obj.steps.count()


class UserEnrolmentSummarySerializer(serializers.Serializer):
    status = serializers.CharField()
    progress_percentage = serializers.IntegerField()
    current_step = serializers.IntegerField()


class ProgrammeListSerializer(serializers.ModelSerializer):
    step_count = serializers.SerializerMethodField()
    enrolment_count = serializers.IntegerField(read_only=True)
    user_enrolment = serializers.SerializerMethodField()
    cover_image = serializers.SerializerMethodField()

    class Meta:
        model = TrainingProgramme
        fields = (
            "id",
            "title",
            "description",
            "category",
            "cover_image",
            "status",
            "is_mandatory",
            "step_count",
            "estimated_duration_minutes",
            "enrolment_count",
            "user_enrolment",
        )

    def get_cover_image(self, obj):
        return build_media_url(self.context.get("request"), obj.cover_image)

    def get_step_count(self, obj):
        return programme_step_count(obj)

    def get_user_enrolment(self, obj):
        enrolment = self.context.get("user_enrolments", {}).get(str(obj.id))
        if enrolment is None:
            return None
        return UserEnrolmentSummarySerializer(
            {
                "status": enrolment.status,
                "progress_percentage": enrolment.progress_percentage,
                "current_step": enrolment.current_step,
            }
        ).data


class TrainingStepSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = TrainingStep
        fields = (
            "id",
            "programme",
            "order",
            "title",
            "description",
            "image",
            "video_url",
            "requires_acknowledgement",
            "tips",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "programme", "order", "created_at", "updated_at")

    def get_image(self, obj):
        return build_media_url(self.context.get("request"), obj.image)


class ProgrammeStatsSerializer(serializers.Serializer):
    total_enrolments = serializers.IntegerField()
    completed_count = serializers.IntegerField()
    in_progress_count = serializers.IntegerField()
    average_completion_minutes = serializers.FloatField(allow_null=True)


class ProgrammeDetailSerializer(serializers.ModelSerializer):
    steps = TrainingStepSerializer(many=True, read_only=True)
    stats = serializers.SerializerMethodField()
    step_count = serializers.SerializerMethodField()
    cover_image = serializers.SerializerMethodField()

    class Meta:
        model = TrainingProgramme
        fields = (
            "id",
            "organisation",
            "title",
            "description",
            "category",
            "cover_image",
            "status",
            "estimated_duration_minutes",
            "is_mandatory",
            "target_roles",
            "locations",
            "created_by",
            "published_at",
            "created_at",
            "updated_at",
            "step_count",
            "steps",
            "stats",
        )
        read_only_fields = (
            "id",
            "organisation",
            "created_by",
            "published_at",
            "created_at",
            "updated_at",
            "step_count",
            "steps",
            "stats",
        )

    def get_cover_image(self, obj):
        return build_media_url(self.context.get("request"), obj.cover_image)

    def get_step_count(self, obj):
        return programme_step_count(obj)

    def get_stats(self, obj):
        enrolments = TrainingEnrolment.objects.filter(programme=obj)
        completed = enrolments.filter(status=TrainingEnrolment.Status.COMPLETED)
        in_progress = enrolments.filter(status=TrainingEnrolment.Status.IN_PROGRESS)
        avg_duration = (
            completed.filter(started_at__isnull=False, completed_at__isnull=False)
            .annotate(
                duration=ExpressionWrapper(
                    F("completed_at") - F("started_at"),
                    output_field=DurationField(),
                )
            )
            .aggregate(avg=Avg("duration"))["avg"]
        )
        avg_minutes = None
        if avg_duration is not None:
            try:
                avg_minutes = round(avg_duration.total_seconds() / 60, 1)
            except (AttributeError, TypeError):
                avg_minutes = None
        return ProgrammeStatsSerializer(
            {
                "total_enrolments": enrolments.count(),
                "completed_count": completed.count(),
                "in_progress_count": in_progress.count(),
                "average_completion_minutes": avg_minutes,
            }
        ).data


class ProgrammeCreateUpdateSerializer(serializers.ModelSerializer):
    location_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        write_only=True,
        allow_empty=True,
    )

    class Meta:
        model = TrainingProgramme
        fields = (
            "title",
            "description",
            "category",
            "cover_image",
            "estimated_duration_minutes",
            "is_mandatory",
            "target_roles",
            "location_ids",
        )

    def create(self, validated_data):
        location_ids = validated_data.pop("location_ids", [])
        request = self.context["request"]
        programme = TrainingProgramme.objects.create(
            organisation=request.user.organisation,
            created_by=request.user,
            status=TrainingProgramme.Status.DRAFT,
            **validated_data,
        )
        programme.locations.set(location_ids)
        return programme

    def update(self, instance, validated_data):
        location_ids = validated_data.pop("location_ids", None)
        programme = super().update(instance, validated_data)
        if location_ids is not None:
            programme.locations.set(location_ids)
        return programme


class TrainingStepCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingStep
        fields = (
            "title",
            "description",
            "image",
            "video_url",
            "requires_acknowledgement",
            "tips",
        )


class TrainingStepUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingStep
        fields = (
            "title",
            "description",
            "image",
            "video_url",
            "requires_acknowledgement",
            "tips",
        )
        extra_kwargs = {
            "title": {"required": False},
            "description": {"required": False},
        }


class StepReorderSerializer(serializers.Serializer):
    step_ids = serializers.ListField(child=serializers.UUIDField())


class UserBriefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    avatar = serializers.CharField(allow_null=True)


class EnrolmentSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    programme_title = serializers.CharField(source="programme.title", read_only=True)
    progress_percentage = serializers.IntegerField(read_only=True)

    class Meta:
        model = TrainingEnrolment
        fields = (
            "id",
            "user",
            "programme_title",
            "status",
            "progress_percentage",
            "current_step",
            "started_at",
            "completed_at",
        )

    def get_user(self, obj):
        request = self.context.get("request")
        avatar = build_media_url(request, obj.user.avatar)
        return UserBriefSerializer(
            {
                "id": obj.user.id,
                "name": obj.user.get_full_name() or obj.user.username,
                "avatar": avatar,
            }
        ).data


class StepCompletionSerializer(serializers.ModelSerializer):
    step_order = serializers.IntegerField(source="step.order", read_only=True)
    step_title = serializers.CharField(source="step.title", read_only=True)

    class Meta:
        model = StepCompletion
        fields = (
            "step_order",
            "step_title",
            "acknowledged",
            "completed_at",
            "notes",
        )


class ProgressStepSerializer(TrainingStepSerializer):
    completed = serializers.SerializerMethodField()

    class Meta(TrainingStepSerializer.Meta):
        fields = TrainingStepSerializer.Meta.fields + ("completed",)

    def get_completed(self, obj):
        completed_ids = self.context.get("completed_step_ids", set())
        return str(obj.id) in completed_ids


class ProgressSerializer(serializers.Serializer):
    enrolment = EnrolmentSerializer()
    steps = ProgressStepSerializer(many=True)
    completions = StepCompletionSerializer(many=True)


class AssignEnrolmentSerializer(serializers.Serializer):
    user_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)


class CompleteStepSerializer(serializers.Serializer):
    acknowledged = serializers.BooleanField(required=False, default=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class TrainingCommentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)

    class Meta:
        model = TrainingComment
        fields = (
            "id",
            "programme",
            "user",
            "user_name",
            "body",
            "step",
            "created_at",
        )
        read_only_fields = ("id", "programme", "user", "user_name", "created_at")


class TrainingCommentCreateSerializer(serializers.ModelSerializer):
    step_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = TrainingComment
        fields = ("body", "step_id")

    def validate_step_id(self, value):
        if value is None:
            return None
        programme = self.context["programme"]
        if not programme.steps.filter(pk=value).exists():
            raise serializers.ValidationError("Step not found in this programme.")
        return value


class ProgrammeHistorySerializer(serializers.ModelSerializer):
    step_count = serializers.SerializerMethodField()
    enrolment_count = serializers.IntegerField(read_only=True)
    completed_count = serializers.IntegerField(read_only=True)
    cover_image = serializers.SerializerMethodField()

    class Meta:
        model = TrainingProgramme
        fields = (
            "id",
            "title",
            "description",
            "category",
            "cover_image",
            "status",
            "is_mandatory",
            "step_count",
            "estimated_duration_minutes",
            "enrolment_count",
            "completed_count",
            "published_at",
            "created_at",
        )

    def get_cover_image(self, obj):
        return build_media_url(self.context.get("request"), obj.cover_image)

    def get_step_count(self, obj):
        return programme_step_count(obj)


class ProgrammeOverviewItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    category = serializers.CharField()
    total_staff = serializers.IntegerField()
    enrolled_count = serializers.IntegerField()
    completed_count = serializers.IntegerField()
    completion_rate = serializers.FloatField()
