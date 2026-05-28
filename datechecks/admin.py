from django.contrib import admin

from .models import DateCheck, DateCheckEntry, DateCheckSchedule, ExpiryAlert


class DateCheckEntryInline(admin.TabularInline):
    model = DateCheckEntry
    extra = 0


@admin.register(DateCheck)
class DateCheckAdmin(admin.ModelAdmin):
    list_display = (
        "location",
        "conducted_by",
        "status",
        "items_checked",
        "items_expired",
        "items_expiring_soon",
        "started_at",
        "completed_at",
    )
    list_filter = ("status", "location")
    inlines = [DateCheckEntryInline]


@admin.register(DateCheckEntry)
class DateCheckEntryAdmin(admin.ModelAdmin):
    list_display = (
        "product_name",
        "earliest_expiry",
        "expiry_status",
        "action_taken",
        "quantity_at_risk",
    )
    list_filter = ("expiry_status", "action_taken")


@admin.register(ExpiryAlert)
class ExpiryAlertAdmin(admin.ModelAdmin):
    list_display = (
        "product_name",
        "expiry_date",
        "alert_level",
        "resolution",
        "location",
        "created_at",
    )
    list_filter = ("alert_level", "resolution", "location")


@admin.register(DateCheckSchedule)
class DateCheckScheduleAdmin(admin.ModelAdmin):
    list_display = (
        "location",
        "frequency",
        "alert_threshold_days",
        "is_overdue",
        "last_check_at",
    )

    @admin.display(boolean=True, description="Overdue")
    def is_overdue(self, obj):
        return obj.is_overdue
