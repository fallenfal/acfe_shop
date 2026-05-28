import uuid
from datetime import date, time, timedelta

from django.core.validators import MinValueValidator
from django.db import models


class DateCheck(models.Model):
    """
    A date check round — someone walking through the stockroom checking expiry dates.
    Similar in structure to StockTake but focused on dates rather than quantities.
    """

    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    location = models.ForeignKey(
        "core.Location", on_delete=models.CASCADE, related_name="date_checks"
    )
    conducted_by = models.ForeignKey(
        "core.User", on_delete=models.SET_NULL, null=True, related_name="date_checks"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.IN_PROGRESS
    )
    notes = models.TextField(
        blank=True,
        help_text=(
            "General notes about this check round, e.g. "
            "'Fridge 2 was not checked — broken seal'"
        ),
    )
    items_checked = models.PositiveIntegerField(
        default=0, help_text="Total items checked in this round"
    )
    items_expired = models.PositiveIntegerField(
        default=0, help_text="Items found already expired"
    )
    items_expiring_soon = models.PositiveIntegerField(
        default=0, help_text="Items expiring within the alert threshold"
    )
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"Date check @ {self.location.name} on {self.started_at:%Y-%m-%d %H:%M}"

    def complete(self, threshold_days=3):
        """Mark this date check as completed and compute summary stats."""
        from django.utils import timezone

        self.status = self.Status.COMPLETED
        self.completed_at = timezone.now()
        self.items_checked = self.entries.count()
        self.items_expired = self.entries.filter(
            earliest_expiry__lt=date.today()
        ).count()
        self.items_expiring_soon = self.entries.filter(
            earliest_expiry__gte=date.today(),
            earliest_expiry__lte=date.today() + timedelta(days=threshold_days),
        ).count()
        self.save()


class DateCheckEntry(models.Model):
    """
    Individual product checked during a date check round.
    Records the earliest expiry date found for that product at that location.
    """

    class ExpiryStatus(models.TextChoices):
        OK = "ok", "OK"
        WARNING = "warning", "Expiring Soon"
        CRITICAL = "critical", "Expires Today/Tomorrow"
        EXPIRED = "expired", "Expired"

    class Action(models.TextChoices):
        NONE = "none", "No Action"
        USE_FIRST = "use_first", "Use First (FIFO)"
        REDUCE_PRICE = "reduce_price", "Reduce Price"
        DISPOSE = "dispose", "Dispose"
        DISPOSED = "disposed", "Disposed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    date_check = models.ForeignKey(
        DateCheck, on_delete=models.CASCADE, related_name="entries"
    )
    stock_item = models.ForeignKey(
        "inventory.StockItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="date_check_entries",
    )
    menu_item = models.ForeignKey(
        "sales.MenuItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="date_check_entries",
    )
    product_name = models.CharField(
        max_length=200,
        help_text="Denormalised product name for display, or custom name if not in stock/menu",
    )
    earliest_expiry = models.DateField(
        help_text="The earliest use-by or best-before date found on this product"
    )
    quantity_at_risk = models.FloatField(
        default=1,
        validators=[MinValueValidator(0)],
        help_text="How many units have this expiry date",
    )
    unit = models.CharField(max_length=20, default="units")
    estimated_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Estimated cost value of the at-risk stock",
    )
    expiry_status = models.CharField(
        max_length=20, choices=ExpiryStatus.choices, default=ExpiryStatus.OK
    )
    action_taken = models.CharField(
        max_length=20, choices=Action.choices, default=Action.NONE
    )
    action_note = models.TextField(
        blank=True,
        help_text="Notes about action taken, e.g. 'Moved to front of display'",
    )
    photo = models.ImageField(
        upload_to="date_check_photos/",
        blank=True,
        null=True,
        help_text="Photo of the date label for audit trail",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["earliest_expiry"]

    def __str__(self):
        return (
            f"{self.product_name} — expires {self.earliest_expiry} "
            f"({self.get_expiry_status_display()})"
        )

    def save(self, *args, **kwargs):
        self.expiry_status = self.compute_status()
        super().save(*args, **kwargs)

    def compute_status(self, threshold_days=3):
        today = date.today()
        if self.earliest_expiry < today:
            return self.ExpiryStatus.EXPIRED
        if self.earliest_expiry <= today + timedelta(days=1):
            return self.ExpiryStatus.CRITICAL
        if self.earliest_expiry <= today + timedelta(days=threshold_days):
            return self.ExpiryStatus.WARNING
        return self.ExpiryStatus.OK


class ExpiryAlert(models.Model):
    """
    Persistent alerts generated from date check entries.
    Stays active until resolved (item used, disposed, or re-checked).
    """

    class AlertLevel(models.TextChoices):
        WARNING = "warning", "Warning — Expiring Soon"
        CRITICAL = "critical", "Critical — Expires Today/Tomorrow"
        EXPIRED = "expired", "Expired — Dispose Immediately"

    class Resolution(models.TextChoices):
        PENDING = "pending", "Pending"
        USED = "used", "Used Before Expiry"
        DISPOSED = "disposed", "Disposed"
        WASTED = "wasted", "Logged as Waste"
        RECHECKED = "rechecked", "Re-checked — Date Updated"
        DISMISSED = "dismissed", "Dismissed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    location = models.ForeignKey(
        "core.Location", on_delete=models.CASCADE, related_name="expiry_alerts"
    )
    date_check_entry = models.ForeignKey(
        DateCheckEntry, on_delete=models.CASCADE, related_name="alerts"
    )
    product_name = models.CharField(max_length=200)
    expiry_date = models.DateField()
    quantity_at_risk = models.FloatField(default=1)
    estimated_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    alert_level = models.CharField(max_length=20, choices=AlertLevel.choices)
    resolution = models.CharField(
        max_length=20, choices=Resolution.choices, default=Resolution.PENDING
    )
    resolved_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_alerts",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_note = models.TextField(blank=True)
    waste_entry = models.ForeignKey(
        "waste.WasteEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expiry_alerts",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["expiry_date", "-alert_level"]

    def __str__(self):
        return f"[{self.get_alert_level_display()}] {self.product_name} — {self.expiry_date}"

    @property
    def is_resolved(self):
        return self.resolution != self.Resolution.PENDING

    @property
    def days_until_expiry(self):
        return (self.expiry_date - date.today()).days


class DateCheckSchedule(models.Model):
    """
    Defines how often date checks should happen at a location.
    Used to show compliance status and trigger reminders if overdue.
    """

    class Frequency(models.TextChoices):
        DAILY = "daily", "Daily"
        EVERY_OTHER_DAY = "every_other_day", "Every Other Day"
        TWICE_WEEKLY = "twice_weekly", "Twice Weekly"
        WEEKLY = "weekly", "Weekly"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    location = models.OneToOneField(
        "core.Location",
        on_delete=models.CASCADE,
        related_name="date_check_schedule",
    )
    frequency = models.CharField(
        max_length=20, choices=Frequency.choices, default=Frequency.DAILY
    )
    alert_threshold_days = models.PositiveIntegerField(
        default=3,
        help_text="Products expiring within this many days trigger a WARNING alert",
    )
    reminder_enabled = models.BooleanField(
        default=True,
        help_text="Send a reminder if no date check has been done today",
    )
    reminder_time = models.TimeField(
        default=time(9, 0),
        help_text="Time to send the reminder if check is overdue",
    )
    last_check_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Auto-updated when a date check is completed",
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.location.name} — {self.get_frequency_display()}"

    @property
    def is_overdue(self):
        if not self.last_check_at:
            return True
        from django.utils import timezone

        gap = timezone.now() - self.last_check_at
        if self.frequency == self.Frequency.DAILY:
            return gap.days >= 1
        if self.frequency == self.Frequency.EVERY_OTHER_DAY:
            return gap.days >= 2
        if self.frequency == self.Frequency.TWICE_WEEKLY:
            return gap.days >= 4
        if self.frequency == self.Frequency.WEEKLY:
            return gap.days >= 7
        return False
