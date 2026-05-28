from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Location, Organisation, Role, User, UserLocationRole


@admin.register(Organisation)
class OrganisationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "created_at")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ("name", "organisation", "is_active", "phone")
    list_filter = ("organisation", "is_active")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "email", "organisation", "is_active")
    list_filter = ("organisation", "is_active", "is_staff")
    fieldsets = BaseUserAdmin.fieldsets + (
        ("ACFE", {"fields": ("organisation", "phone", "avatar")}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("ACFE", {"fields": ("organisation", "phone")}),
    )


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("name", "organisation", "is_system_role")
    list_filter = ("organisation", "is_system_role")


@admin.register(UserLocationRole)
class UserLocationRoleAdmin(admin.ModelAdmin):
    list_display = ("user", "location", "role", "assigned_at")
    list_filter = ("location", "role")
