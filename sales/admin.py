from django.contrib import admin

from .models import DailySalesSummary, MenuItem, Sale, SaleItem


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "category",
        "price",
        "ingredient_cost",
        "margin",
        "is_active",
    )
    list_filter = ("organisation", "category", "is_active")

    @admin.display(description="Margin %")
    def margin(self, obj):
        return f"{obj.margin:.1f}%"


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ("location", "timestamp", "total_amount", "payment_method")
    list_filter = ("location", "payment_method")
    inlines = [SaleItemInline]


@admin.register(SaleItem)
class SaleItemAdmin(admin.ModelAdmin):
    list_display = ("sale", "menu_item", "quantity", "line_total")


@admin.register(DailySalesSummary)
class DailySalesSummaryAdmin(admin.ModelAdmin):
    list_display = (
        "location",
        "date",
        "total_revenue",
        "transaction_count",
        "waste_percentage",
    )
    list_filter = ("location",)
