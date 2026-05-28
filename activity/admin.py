from django.contrib import admin

from .models import ActivityLog


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ("user", "action_type", "target_model", "location", "created_at")
    list_filter = ("action_type", "location")
    readonly_fields = ("created_at",)
