import uuid

from django.db import models


class Memo(models.Model):
    """
    Internal memos and announcements for staff at a location.
    CMs create memos; staff read and acknowledge them.
    Owners can post org-wide (location=null).
    """

    class Priority(models.TextChoices):
        NORMAL = "normal", "Normal"
        IMPORTANT = "important", "Important"
        URGENT = "urgent", "Urgent"

    class Category(models.TextChoices):
        DAILY_BRIEFING = "daily_briefing", "Daily Briefing"
        POLICY_UPDATE = "policy_update", "Policy Update"
        EQUIPMENT = "equipment", "Equipment"
        MENU_CHANGE = "menu_change", "Menu Change"
        HEALTH_SAFETY = "health_safety", "Health & Safety"
        GENERAL = "general", "General"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    location = models.ForeignKey(
        "core.Location",
        on_delete=models.CASCADE,
        related_name="memos",
        null=True,
        blank=True,
        help_text="Null = org-wide memo visible at all locations",
    )
    organisation = models.ForeignKey(
        "core.Organisation", on_delete=models.CASCADE, related_name="memos"
    )
    author = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="authored_memos",
    )
    title = models.CharField(max_length=300)
    body = models.TextField(help_text="Rich text / markdown content")
    priority = models.CharField(
        max_length=20, choices=Priority.choices, default=Priority.NORMAL
    )
    category = models.CharField(
        max_length=30, choices=Category.choices, default=Category.GENERAL
    )
    is_pinned = models.BooleanField(default=False, help_text="Sticky at top of feed")
    requires_acknowledgement = models.BooleanField(
        default=False,
        help_text="If true, staff must confirm they've read this",
    )
    target_roles = models.JSONField(
        default=list,
        blank=True,
        help_text="Empty = all roles. Or list of role slugs, e.g. ['staff', 'content_manager']",
    )
    visible_from = models.DateTimeField(null=True, blank=True)
    visible_until = models.DateTimeField(null=True, blank=True)
    attachments = models.JSONField(
        default=list,
        blank=True,
        help_text="List of file URLs/paths attached to this memo",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set when soft-deleted; hidden from API lists",
    )

    class Meta:
        ordering = ["-is_pinned", "-created_at"]

    def __str__(self):
        loc = self.location.name if self.location else "All Locations"
        return f"[{loc}] {self.title}"


class MemoAcknowledgement(models.Model):
    """Tracks which users have read and acknowledged a memo."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    memo = models.ForeignKey(
        Memo, on_delete=models.CASCADE, related_name="acknowledgements"
    )
    user = models.ForeignKey(
        "core.User", on_delete=models.CASCADE, related_name="memo_acknowledgements"
    )
    acknowledged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("memo", "user")

    def __str__(self):
        return f"{self.user.username} ack'd '{self.memo.title}'"


class MemoComment(models.Model):
    """Staff can ask clarifying questions or reply to memos."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    memo = models.ForeignKey(
        Memo, on_delete=models.CASCADE, related_name="comments"
    )
    user = models.ForeignKey(
        "core.User", on_delete=models.CASCADE, related_name="memo_comments"
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment by {self.user.username} on '{self.memo.title}'"
