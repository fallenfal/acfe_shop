from django.contrib import admin

from .models import (
    LocationStock,
    StockAdjustment,
    StockItem,
    StockTake,
    StockTakeEntry,
)


class StockTakeEntryInline(admin.TabularInline):
    model = StockTakeEntry
    extra = 0


@admin.register(StockItem)
class StockItemAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "unit", "organisation")
    list_filter = ("organisation", "category")


@admin.register(LocationStock)
class LocationStockAdmin(admin.ModelAdmin):
    list_display = (
        "stock_item",
        "location",
        "current_quantity",
        "par_level",
        "is_below_par",
    )
    list_filter = ("location",)

    @admin.display(boolean=True, description="Below par")
    def is_below_par(self, obj):
        return obj.is_below_par


@admin.register(StockTake)
class StockTakeAdmin(admin.ModelAdmin):
    list_display = ("location", "conducted_by", "conducted_at")
    inlines = [StockTakeEntryInline]


@admin.register(StockAdjustment)
class StockAdjustmentAdmin(admin.ModelAdmin):
    list_display = (
        "stock_item",
        "location",
        "adjustment_type",
        "quantity_change",
        "created_by",
        "created_at",
    )
    list_filter = ("adjustment_type", "location")
