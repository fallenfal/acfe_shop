from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from activity.models import ActivityLog
from activity.services import log_activity
from core.mixins import LocationScopedMixin
from core.permissions import (
    LocationPermission,
    PermissionRequired,
    user_is_cm_or_above,
    user_is_org_owner,
)
from memos.api.pagination import MemoPagination
from memos.api.serializers import (
    MemoCommentCreateSerializer,
    MemoCommentSerializer,
    MemoCreateUpdateSerializer,
    MemoDetailSerializer,
    MemoListSerializer,
)
from memos.api.querysets import filter_memos_for_user_role
from memos.models import Memo, MemoAcknowledgement, MemoComment


class MemoViewSet(LocationScopedMixin, viewsets.ModelViewSet):
    """
    Location-scoped memos API. Org-wide memos (location=null) appear in every
    location feed for the same organisation.
    """

    queryset = Memo.objects.all()
    include_org_wide = True
    organisation_field = "organisation"
    pagination_class = MemoPagination
    http_method_names = ["get", "head", "options", "post", "put", "delete"]

    def get_permissions(self):
        permission_map = {
            "list": "memos.read",
            "retrieve": "memos.read",
            "create": "memos.create",
            # Object-level rules in perform_update / perform_destroy
            "update": "memos.read",
            "partial_update": "memos.read",
            "destroy": "memos.read",
            "acknowledge": "memos.acknowledge",
            "add_comment": "memos.read",
            "unread_count": "memos.read",
        }
        perm_path = permission_map.get(self.action, "memos.read")
        return [
            IsAuthenticated(),
            LocationPermission(),
            PermissionRequired(perm_path)(),
        ]

    def get_serializer_class(self):
        if self.action == "list":
            return MemoListSerializer
        if self.action == "retrieve":
            return MemoDetailSerializer
        if self.action == "add_comment":
            return MemoCommentCreateSerializer
        return MemoCreateUpdateSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["location"] = self.location
        return context

    def get_queryset(self):
        now = timezone.now()
        user = self.request.user
        user_ack = MemoAcknowledgement.objects.filter(
            memo=OuterRef("pk"), user=user
        )

        qs = (
            super()
            .get_queryset()
            .filter(deleted_at__isnull=True)
            .filter(
                Q(visible_from__isnull=True) | Q(visible_from__lte=now),
                Q(visible_until__isnull=True) | Q(visible_until__gte=now),
            )
            .select_related("author", "location", "organisation")
            .annotate(
                acknowledgement_count=Count("acknowledgements", distinct=True),
                comment_count=Count("comments", distinct=True),
                is_read=Exists(user_ack),
            )
            .order_by("-is_pinned", "-created_at")
        )

        role = None
        if self.user_location_role:
            role = self.user_location_role.role.slug
        elif self.location:
            role = user.get_role_at(self.location)
            role = role.slug if role else None
        qs = filter_memos_for_user_role(qs, role)

        qs = self._apply_list_filters(qs)
        return qs

    def _apply_list_filters(self, queryset):
        params = self.request.query_params
        category = params.get("category")
        if category:
            queryset = queryset.filter(category=category)
        priority = params.get("priority")
        if priority:
            queryset = queryset.filter(priority=priority)
        is_pinned = params.get("is_pinned")
        if is_pinned is not None and is_pinned != "":
            queryset = queryset.filter(
                is_pinned=is_pinned.lower() in ("1", "true", "yes")
            )
        return queryset

    def get_object(self):
        queryset = self.filter_queryset(self.get_queryset())
        return super().get_object()

    def _memo_detail_queryset(self, pk):
        return (
            Memo.objects.filter(pk=pk)
            .select_related("author", "location", "organisation")
            .prefetch_related("comments__user", "acknowledgements__user")
            .annotate(
                acknowledgement_count=Count("acknowledgements", distinct=True),
                comment_count=Count("comments", distinct=True),
            )
        )

    def _detail_response(self, memo, status_code=status.HTTP_200_OK):
        instance = self._memo_detail_queryset(memo.pk).first()
        serializer = MemoDetailSerializer(
            instance, context=self.get_serializer_context()
        )
        return Response(serializer.data, status=status_code)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return self._detail_response(
            serializer.instance, status_code=status.HTTP_201_CREATED
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return self._detail_response(serializer.instance)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        return self._detail_response(instance)

    def _user_can_edit_memo(self, memo):
        if memo.author_id == self.request.user.id:
            return True
        if self.all_locations:
            return user_is_org_owner(
                self.request.user, getattr(self.request.user, "organisation", None)
            )
        return user_is_cm_or_above(self.request.user, self.location)

    def _user_can_delete_memo(self):
        if self.all_locations:
            return user_is_org_owner(
                self.request.user, getattr(self.request.user, "organisation", None)
            )
        return user_is_cm_or_above(self.request.user, self.location)

    def _log_memo_activity(self, action_type, memo, details=None):
        organisation = memo.organisation
        location = memo.location or self.location
        log_activity(
            self.request,
            action_type,
            organisation=organisation,
            location=location,
            target_model="Memo",
            target_id=memo.id,
            details=details or {"title": memo.title},
        )

    def perform_create(self, serializer):
        organisation = self.location.organisation if self.location else None
        if organisation is None:
            organisation = self.request.user.organisation

        save_kwargs = {
            "author": self.request.user,
            "organisation": organisation,
        }

        if "location" in serializer.validated_data:
            loc = serializer.validated_data.get("location")
            if loc is None:
                if not user_is_org_owner(self.request.user, organisation):
                    raise PermissionDenied("Only owners can create org-wide memos.")
                save_kwargs["location"] = None
            else:
                save_kwargs["location"] = loc
        elif self.location:
            save_kwargs["location"] = self.location

        memo = serializer.save(**save_kwargs)
        self._log_memo_activity(ActivityLog.ActionType.MEMO_CREATED, memo)

    def perform_update(self, serializer):
        memo = self.get_object()
        if not self._user_can_edit_memo(memo):
            raise PermissionDenied("Only the author or a content manager may edit this memo.")
        memo = serializer.save()
        self._log_memo_activity(ActivityLog.ActionType.MEMO_UPDATED, memo)

    def perform_destroy(self, instance):
        if not self._user_can_delete_memo():
            raise PermissionDenied("Only content managers and owners may delete memos.")

        hard = self.request.query_params.get("hard", "").lower() in (
            "1",
            "true",
            "yes",
        )
        if hard:
            title = instance.title
            memo_id = instance.id
            organisation = instance.organisation
            location = instance.location or self.location
            instance.delete()
            log_activity(
                self.request,
                ActivityLog.ActionType.MEMO_DELETED,
                organisation=organisation,
                location=location,
                target_model="Memo",
                target_id=memo_id,
                details={"title": title, "hard_delete": True},
            )
            return

        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at", "updated_at"])
        self._log_memo_activity(
            ActivityLog.ActionType.MEMO_DELETED,
            instance,
            details={"title": instance.title, "hard_delete": False},
        )

    @action(detail=True, methods=["post"], url_path="acknowledge")
    def acknowledge(self, request, location_id=None, pk=None):
        memo = self.get_object()
        _, created = MemoAcknowledgement.objects.get_or_create(
            memo=memo, user=request.user
        )
        if created:
            self._log_memo_activity(ActivityLog.ActionType.MEMO_ACKNOWLEDGED, memo)
        return Response(
            {"is_read": True, "created": created},
            status=status.HTTP_200_OK if not created else status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="comments")
    def add_comment(self, request, location_id=None, pk=None):
        memo = self.get_object()
        serializer = MemoCommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = MemoComment.objects.create(
            memo=memo,
            user=request.user,
            body=serializer.validated_data["body"],
        )
        return Response(
            MemoCommentSerializer(comment).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request, location_id=None):
        user_ack = MemoAcknowledgement.objects.filter(
            memo=OuterRef("pk"), user=request.user
        )
        count = (
            self.filter_queryset(self.get_queryset())
            .filter(requires_acknowledgement=True)
            .filter(~Exists(user_ack))
            .count()
        )
        return Response({"count": count})
