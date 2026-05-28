from django.db.models import Count
from rest_framework import serializers

from core.models import Location, UserLocationRole
from memos.models import Memo, MemoComment


class MemoCommentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)

    class Meta:
        model = MemoComment
        fields = ("id", "user", "user_name", "body", "created_at")
        read_only_fields = ("id", "user", "user_name", "created_at")


class MemoListSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.get_full_name", read_only=True)
    is_read = serializers.BooleanField(read_only=True)
    acknowledgement_count = serializers.IntegerField(read_only=True)
    comment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Memo
        fields = (
            "id",
            "title",
            "priority",
            "category",
            "author_name",
            "is_pinned",
            "is_read",
            "requires_acknowledgement",
            "created_at",
            "acknowledgement_count",
            "comment_count",
        )


class MemoDetailSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.get_full_name", read_only=True)
    is_read = serializers.SerializerMethodField()
    comments = MemoCommentSerializer(many=True, read_only=True)
    acknowledged_users = serializers.SerializerMethodField()
    pending_users = serializers.SerializerMethodField()
    acknowledgement_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()

    class Meta:
        model = Memo
        fields = (
            "id",
            "location",
            "organisation",
            "author",
            "author_name",
            "title",
            "body",
            "priority",
            "category",
            "is_pinned",
            "requires_acknowledgement",
            "target_roles",
            "visible_from",
            "visible_until",
            "attachments",
            "is_read",
            "created_at",
            "updated_at",
            "comments",
            "acknowledged_users",
            "pending_users",
            "acknowledgement_count",
            "comment_count",
        )

    def get_is_read(self, memo):
        user = self.context["request"].user
        return memo.acknowledgements.filter(user=user).exists()

    def get_acknowledgement_count(self, memo):
        if hasattr(memo, "acknowledgement_count"):
            return memo.acknowledgement_count
        return memo.acknowledgements.count()

    def get_comment_count(self, memo):
        if hasattr(memo, "comment_count"):
            return memo.comment_count
        return memo.comments.count()

    def _location_assignments(self, memo):
        location = self.context.get("location")
        if location is None:
            return UserLocationRole.objects.none()
        qs = UserLocationRole.objects.filter(location=location).select_related(
            "user", "role"
        )
        if memo.target_roles:
            qs = qs.filter(role__slug__in=memo.target_roles)
        return qs

    def get_acknowledged_users(self, memo):
        acks = {
            a.user_id: a.acknowledged_at
            for a in memo.acknowledgements.select_related("user").all()
        }
        result = []
        for assignment in self._location_assignments(memo):
            if assignment.user_id in acks:
                result.append(
                    {
                        "id": assignment.user_id,
                        "name": assignment.user.get_full_name() or assignment.user.username,
                        "acknowledged_at": acks[assignment.user_id],
                    }
                )
        return result

    def get_pending_users(self, memo):
        acked_ids = set(memo.acknowledgements.values_list("user_id", flat=True))
        result = []
        for assignment in self._location_assignments(memo):
            if assignment.user_id not in acked_ids:
                result.append(
                    {
                        "id": assignment.user_id,
                        "name": assignment.user.get_full_name() or assignment.user.username,
                        "acknowledged_at": None,
                    }
                )
        return result


class MemoCreateUpdateSerializer(serializers.ModelSerializer):
    location = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Memo
        fields = (
            "title",
            "body",
            "priority",
            "category",
            "is_pinned",
            "requires_acknowledgement",
            "target_roles",
            "visible_from",
            "visible_until",
            "attachments",
            "location",
        )

    def validate_location(self, value):
        if value is not None:
            request = self.context["request"]
            view = self.context.get("view")
            active_location = getattr(view, "location", None)
            if active_location and value.pk != active_location.pk:
                raise serializers.ValidationError(
                    "Location must match the URL location or be null for org-wide memos."
                )
            org = getattr(request.user, "organisation", None)
            if org and value.organisation_id != org.id:
                raise serializers.ValidationError(
                    "Location must belong to your organisation."
                )
        return value


class MemoCommentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MemoComment
        fields = ("body",)
