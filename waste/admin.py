from django.contrib import admin

from .models import WasteEntry


@admin.register(WasteEntry)
class WasteEntryAdmin(admin.ModelAdmin):
    list_display = (
        "item_type",
        "menu_item",
        "stock_item",
        "quantity",
        "reason",
        "shift",
        "cost_value",
        "logged_by",
        "logged_at",
    )
    list_filter = ("reason", "shift", "location")
