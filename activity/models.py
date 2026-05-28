import uuid

from django.db import models


class ActivityLog(models.Model):
    """
    Audit trail logging all significant actions across the system.
    Viewable by Owners (all locations) and CMs (their location only).
    """

    class ActionType(models.TextChoices):
        # Auth
        LOGIN = "login", "User Login"
        LOGOUT = "logout", "User Logout"
        # Memos
        MEMO_CREATED = "memo_created", "Memo Created"
        MEMO_UPDATED = "memo_updated", "Memo Updated"
        MEMO_DELETED = "memo_deleted", "Memo Deleted"
        MEMO_ACKNOWLEDGED = "memo_acknowledged", "Memo Acknowledged"
        # Inventory
        STOCK_TAKE = "stock_take", "Stock Take Completed"
        STOCK_ADJUSTED = "stock_adjusted", "Stock Adjusted"
        STOCK_TRANSFER = "stock_transfer", "Stock Transferred"
        # Waste
        WASTE_LOGGED = "waste_logged", "Waste Logged"
        # Users
        USER_INVITED = "user_invited", "User Invited"
        USER_DEACTIVATED = "user_deactivated", "User Deactivated"
        ROLE_CHANGED = "role_changed", "Role Changed"
        # Sales
        SALE_IMPORTED = "sale_imported", "Sales Data Imported"
        # Date checks
        DATE_CHECK_STARTED = "date_check_started", "Date Check Started"
        DATE_CHECK_COMPLETED = "date_check_completed", "Date Check Completed"
        EXPIRY_ALERT_RESOLVED = "expiry_alert_resolved", "Expiry Alert Resolved"
        # Training
        TRAINING_CREATED = "training_created", "Training Programme Created"
        TRAINING_PUBLISHED = "training_published", "Training Programme Published"
        TRAINING_ARCHIVED = "training_archived", "Training Programme Archived"
        TRAINING_ENROLLED = "training_enrolled", "Training Enrolled"
        TRAINING_STEP_COMPLETED = "training_step_completed", "Training Step Completed"
        TRAINING_COMPLETED = "training_completed", "Training Completed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        "core.Organisation", on_delete=models.CASCADE, related_name="activity_logs"
    )
    location = models.ForeignKey(
        "core.Location",
        on_delete=models.CASCADE,
        related_name="activity_logs",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        "core.User", on_delete=models.SET_NULL, null=True, related_name="activity_logs"
    )
    action_type = models.CharField(max_length=30, choices=ActionType.choices)
    target_model = models.CharField(
        max_length=100,
        blank=True,
        help_text="e.g. 'Memo', 'StockItem', 'User'",
    )
    target_id = models.UUIDField(null=True, blank=True)
    details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Extra context, e.g. {'old_role': 'staff', 'new_role': 'content_manager'}",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} → {self.get_action_type_display()} @ {self.created_at:%H:%M}"
