import uuid

from django.core.validators import MinValueValidator
from django.db import models


class WasteEntry(models.Model):
    """
    Individual waste log entry. Staff record what was wasted, how much, and why.
    Integrates with inventory (auto-deducts stock) and forecasting (feedback loop).
    """

    class Reason(models.TextChoices):
        OVER_PRODUCTION = "over_production", "Over-production / Over-prepped"
        EXPIRED = "expired", "Expired / Past Use-by"
        CUSTOMER_RETURN = "customer_return", "Customer Return / Remake"
        DROPPED_SPILLAGE = "dropped_spillage", "Dropped / Spillage"
        EQUIPMENT_FAILURE = "equipment_failure", "Equipment Failure"
        QUALITY_ISSUE = "quality_issue", "Quality Issue"
        OTHER = "other", "Other"

    class Shift(models.TextChoices):
        MORNING = "morning", "Morning"
        AFTERNOON = "afternoon", "Afternoon"
        EVENING = "evening", "Evening"

    class ItemType(models.TextChoices):
        MENU_ITEM = "menu_item", "Menu Item"
        STOCK_ITEM = "stock_item", "Stock Item"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    location = models.ForeignKey(
        "core.Location", on_delete=models.CASCADE, related_name="waste_entries"
    )
    item_type = models.CharField(max_length=20, choices=ItemType.choices)
    # Generic FK approach: store the item ID and resolve via item_type
    menu_item = models.ForeignKey(
        "sales.MenuItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="waste_entries",
    )
    stock_item = models.ForeignKey(
        "inventory.StockItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="waste_entries",
    )
    quantity = models.FloatField(validators=[MinValueValidator(0.01)])
    unit = models.CharField(max_length=20)
    reason = models.CharField(max_length=30, choices=Reason.choices)
    reason_note = models.TextField(
        blank=True, help_text="Free-text detail, especially if reason is 'Other'"
    )
    shift = models.CharField(max_length=20, choices=Shift.choices)
    cost_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Calculated from item cost × quantity",
    )
    photo = models.ImageField(upload_to="waste_photos/", blank=True, null=True)
    logged_by = models.ForeignKey(
        "core.User", on_delete=models.SET_NULL, null=True, related_name="waste_entries"
    )
    logged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-logged_at"]
        verbose_name_plural = "waste entries"

    def __str__(self):
        item = self.menu_item or self.stock_item
        return f"Waste: {item} × {self.quantity} ({self.get_reason_display()})"
