import uuid

from django.core.validators import MinValueValidator
from django.db import models


class StockItem(models.Model):
    """
    Master catalogue of items the café uses. Defined at org level so all
    locations share the same product list. Quantities are per-location
    via LocationStock.
    """

    class Category(models.TextChoices):
        DAIRY = "dairy", "Dairy"
        COFFEE_TEA = "coffee_tea", "Coffee & Tea"
        DRY_GOODS = "dry_goods", "Dry Goods"
        FRESH_PRODUCE = "fresh_produce", "Fresh Produce"
        BAKERY = "bakery", "Bakery"
        MEAT_FISH = "meat_fish", "Meat & Fish"
        BEVERAGES = "beverages", "Beverages"
        PACKAGING = "packaging", "Packaging"
        CLEANING = "cleaning", "Cleaning"
        OTHER = "other", "Other"

    class Unit(models.TextChoices):
        KG = "kg", "Kilograms"
        G = "g", "Grams"
        L = "l", "Litres"
        ML = "ml", "Millilitres"
        UNITS = "units", "Units"
        BOXES = "boxes", "Boxes"
        BAGS = "bags", "Bags"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        "core.Organisation", on_delete=models.CASCADE, related_name="stock_items"
    )
    name = models.CharField(max_length=200)
    category = models.CharField(
        max_length=30, choices=Category.choices, default=Category.OTHER
    )
    unit = models.CharField(max_length=10, choices=Unit.choices, default=Unit.UNITS)
    preferred_suppliers = models.JSONField(
        default=list,
        blank=True,
        help_text="List of supplier names/contacts for this item",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["category", "name"]
        unique_together = ("organisation", "name")

    def __str__(self):
        return f"{self.name} ({self.get_unit_display()})"


class LocationStock(models.Model):
    """
    Per-location stock levels. Each location can have different quantities,
    par levels, and unit costs for the same stock item.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stock_item = models.ForeignKey(
        StockItem, on_delete=models.CASCADE, related_name="location_stocks"
    )
    location = models.ForeignKey(
        "core.Location", on_delete=models.CASCADE, related_name="stock_levels"
    )
    current_quantity = models.FloatField(
        default=0, validators=[MinValueValidator(0)]
    )
    par_level = models.FloatField(
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Minimum quantity before triggering a low-stock alert",
    )
    unit_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Cost per unit in GBP",
    )
    last_counted_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("stock_item", "location")

    def __str__(self):
        return f"{self.stock_item.name} @ {self.location.name}: {self.current_quantity}"

    @property
    def is_below_par(self):
        return self.current_quantity < self.par_level

    @property
    def stock_value(self):
        return self.current_quantity * float(self.unit_cost)


class StockTake(models.Model):
    """A formal stock count event at a location."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    location = models.ForeignKey(
        "core.Location", on_delete=models.CASCADE, related_name="stock_takes"
    )
    conducted_by = models.ForeignKey(
        "core.User", on_delete=models.SET_NULL, null=True, related_name="stock_takes"
    )
    notes = models.TextField(blank=True)
    conducted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-conducted_at"]

    def __str__(self):
        return f"Stock take @ {self.location.name} on {self.conducted_at:%Y-%m-%d}"


class StockTakeEntry(models.Model):
    """Individual item count within a stock take."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stock_take = models.ForeignKey(
        StockTake, on_delete=models.CASCADE, related_name="entries"
    )
    stock_item = models.ForeignKey(
        StockItem, on_delete=models.CASCADE, related_name="stock_take_entries"
    )
    counted_quantity = models.FloatField(validators=[MinValueValidator(0)])
    expected_quantity = models.FloatField(
        null=True,
        blank=True,
        help_text="What the system thought we had (snapshot at count time)",
    )
    variance = models.FloatField(
        null=True,
        blank=True,
        help_text="counted - expected (positive = surplus, negative = shrinkage)",
    )

    class Meta:
        unique_together = ("stock_take", "stock_item")

    def save(self, *args, **kwargs):
        if self.expected_quantity is not None:
            self.variance = self.counted_quantity - self.expected_quantity
        super().save(*args, **kwargs)


class StockAdjustment(models.Model):
    """
    Any change to stock between formal stock takes:
    deliveries, waste deductions, inter-location transfers, manual corrections.
    """

    class AdjustmentType(models.TextChoices):
        DELIVERY = "delivery", "Delivery Received"
        WASTE = "waste", "Waste Deduction"
        TRANSFER_OUT = "transfer_out", "Transfer Out"
        TRANSFER_IN = "transfer_in", "Transfer In"
        CORRECTION = "correction", "Manual Correction"
        SALE_DEDUCTION = "sale_deduction", "Sale Deduction"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    location = models.ForeignKey(
        "core.Location", on_delete=models.CASCADE, related_name="stock_adjustments"
    )
    stock_item = models.ForeignKey(
        StockItem, on_delete=models.CASCADE, related_name="adjustments"
    )
    adjustment_type = models.CharField(
        max_length=20, choices=AdjustmentType.choices
    )
    quantity_change = models.FloatField(
        help_text="Positive = stock in, negative = stock out"
    )
    related_location = models.ForeignKey(
        "core.Location",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfer_adjustments",
        help_text="For transfers: the other location involved",
    )
    related_waste_entry = models.ForeignKey(
        "waste.WasteEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Auto-linked when waste is logged",
    )
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "core.User", on_delete=models.SET_NULL, null=True, related_name="stock_adjustments"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"{self.get_adjustment_type_display()}: "
            f"{self.stock_item.name} ({self.quantity_change:+.1f})"
        )
