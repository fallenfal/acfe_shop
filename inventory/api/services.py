"""Inventory business logic shared by API views."""

from django.db import transaction
from django.utils import timezone

from inventory.models import LocationStock, StockAdjustment, StockItem, StockTake, StockTakeEntry


def get_or_create_location_stock(stock_item, location):
    location_stock, _ = LocationStock.objects.get_or_create(
        stock_item=stock_item,
        location=location,
        defaults={"current_quantity": 0, "par_level": 0, "unit_cost": 0},
    )
    return location_stock


@transaction.atomic
def apply_stock_adjustment(
    *,
    location,
    stock_item,
    adjustment_type,
    quantity_change,
    related_location=None,
    notes="",
    created_by=None,
    related_waste_entry=None,
):
    """
    Create an adjustment and update LocationStock.current_quantity.
    For transfers, also creates the inverse adjustment at related_location.
    """
    location_stock = get_or_create_location_stock(stock_item, location)
    new_quantity = location_stock.current_quantity + quantity_change
    if new_quantity < 0:
        raise ValueError("Insufficient stock for this adjustment.")

    adjustment = StockAdjustment.objects.create(
        location=location,
        stock_item=stock_item,
        adjustment_type=adjustment_type,
        quantity_change=quantity_change,
        related_location=related_location,
        related_waste_entry=related_waste_entry,
        notes=notes,
        created_by=created_by,
    )
    location_stock.current_quantity = new_quantity
    location_stock.save(update_fields=["current_quantity", "updated_at"])

    inverse = None
    if adjustment_type == StockAdjustment.AdjustmentType.TRANSFER_OUT:
        if related_location is None:
            raise ValueError("related_location is required for transfers.")
        inverse = apply_stock_adjustment(
            location=related_location,
            stock_item=stock_item,
            adjustment_type=StockAdjustment.AdjustmentType.TRANSFER_IN,
            quantity_change=-quantity_change,
            related_location=location,
            notes=notes,
            created_by=created_by,
        )[0]

    return adjustment, inverse


@transaction.atomic
def submit_stock_take_entries(stock_take, entries_data):
    """
    Process a batch of stock take entries, update quantities, and return created entries.
    entries_data: list of dicts with stock_item_id and counted_quantity.
    """
    location = stock_take.location
    now = timezone.now()
    created_entries = []

    for entry_data in entries_data:
        stock_item_id = entry_data["stock_item_id"]
        counted_quantity = entry_data["counted_quantity"]

        try:
            stock_item = StockItem.objects.get(
                pk=stock_item_id,
                organisation=location.organisation,
                is_active=True,
            )
        except StockItem.DoesNotExist as exc:
            raise ValueError(f"Unknown stock item: {stock_item_id}") from exc

        location_stock = get_or_create_location_stock(stock_item, location)
        expected = location_stock.current_quantity

        entry, created = StockTakeEntry.objects.update_or_create(
            stock_take=stock_take,
            stock_item=stock_item,
            defaults={
                "counted_quantity": counted_quantity,
                "expected_quantity": expected,
            },
        )
        entry.save()
        created_entries.append(entry)

        location_stock.current_quantity = counted_quantity
        location_stock.last_counted_at = now
        location_stock.save(
            update_fields=["current_quantity", "last_counted_at", "updated_at"]
        )

    return created_entries
