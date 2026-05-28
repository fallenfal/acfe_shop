"""Waste logging business logic."""

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from inventory.api.services import apply_stock_adjustment
from inventory.models import LocationStock, StockAdjustment
from waste.models import WasteEntry


def calculate_waste_cost(*, location, item_type, menu_item=None, stock_item=None, quantity):
    """Cost from menu ingredient_cost or location stock unit_cost × quantity."""
    qty = Decimal(str(quantity))
    if item_type == WasteEntry.ItemType.MENU_ITEM:
        if menu_item is None:
            raise ValueError("menu_item is required for menu item waste.")
        return (menu_item.ingredient_cost * qty).quantize(Decimal("0.01"))
    if item_type == WasteEntry.ItemType.STOCK_ITEM:
        if stock_item is None:
            raise ValueError("stock_item is required for stock item waste.")
        location_stock = LocationStock.objects.filter(
            stock_item=stock_item, location=location
        ).first()
        unit_cost = location_stock.unit_cost if location_stock else Decimal("0")
        return (unit_cost * qty).quantize(Decimal("0.01"))
    raise ValueError("Invalid item_type.")


@transaction.atomic
def create_waste_entry(
    *,
    location,
    item_type,
    menu_item=None,
    stock_item=None,
    quantity,
    unit,
    reason,
    reason_note="",
    shift,
    photo=None,
    logged_by=None,
    cost_value=None,
):
    """Create waste entry, deduct stock when applicable, return entry."""
    if cost_value is None:
        cost_value = calculate_waste_cost(
            location=location,
            item_type=item_type,
            menu_item=menu_item,
            stock_item=stock_item,
            quantity=quantity,
        )
    else:
        cost_value = Decimal(str(cost_value)).quantize(Decimal("0.01"))

    entry = WasteEntry.objects.create(
        location=location,
        item_type=item_type,
        menu_item=menu_item,
        stock_item=stock_item,
        quantity=quantity,
        unit=unit,
        reason=reason,
        reason_note=reason_note,
        shift=shift,
        cost_value=cost_value,
        photo=photo,
        logged_by=logged_by,
    )

    if item_type == WasteEntry.ItemType.STOCK_ITEM and stock_item is not None:
        note = f"Waste: {entry.get_reason_display()}"
        if reason_note:
            note = f"{note} — {reason_note}"
        apply_stock_adjustment(
            location=location,
            stock_item=stock_item,
            adjustment_type=StockAdjustment.AdjustmentType.WASTE,
            quantity_change=-float(quantity),
            notes=note,
            created_by=logged_by,
            related_waste_entry=entry,
        )

    return entry


@transaction.atomic
def delete_waste_entry(entry):
    """Delete waste entry and reverse linked stock deduction if any."""
    adjustment = StockAdjustment.objects.filter(related_waste_entry=entry).first()
    if adjustment is not None:
        location_stock = LocationStock.objects.filter(
            stock_item=adjustment.stock_item,
            location=adjustment.location,
        ).first()
        if location_stock is not None:
            location_stock.current_quantity -= adjustment.quantity_change
            location_stock.save(update_fields=["current_quantity", "updated_at"])
        adjustment.delete()
    entry.delete()
