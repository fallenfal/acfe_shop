import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class Organisation(models.Model):
    """
    Top-level business entity. Everything belongs to an organisation.
    Even if you only have one café now, this lets you scale later.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True, help_text="URL-safe identifier, e.g. 'acfe-coffee'")
    logo = models.ImageField(upload_to="org_logos/", blank=True, null=True)
    settings = models.JSONField(
        default=dict,
        blank=True,
        help_text="Global settings: timezone, currency, date format, etc.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Location(models.Model):
    """
    An individual café site. All operational data (memos, stock, waste, sales)
    is scoped to a location. This is the primary filtering key across the system.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, related_name="locations"
    )
    name = models.CharField(max_length=200, help_text="e.g. 'ACFE Aberdeen Union St'")
    slug = models.SlugField(help_text="URL-safe identifier for this location")
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    opening_hours = models.JSONField(
        default=dict,
        blank=True,
        help_text="e.g. {'monday': {'open': '07:00', 'close': '18:00'}, ...}",
    )
    timezone = models.CharField(max_length=50, default="Europe/London")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organisation", "slug")
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.organisation.name})"


class User(AbstractUser):
    """
    Custom user model. Users exist at org level (not location level) because
    someone might work at multiple branches or be an area manager.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="users",
        null=True,
        blank=True,
        help_text="Null only for superadmin accounts",
    )
    phone = models.CharField(max_length=30, blank=True)
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    is_active = models.BooleanField(default=True)

    # The locations and roles this user has are defined via UserLocationRole

    def get_locations(self):
        """Return all locations this user has access to."""
        return Location.objects.filter(
            user_location_roles__user=self,
            is_active=True,
        )

    def get_role_at(self, location):
        """Return the user's role at a specific location, or None."""
        try:
            return self.user_location_roles.get(location=location).role
        except UserLocationRole.DoesNotExist:
            return None

    def has_permission_at(self, location, permission):
        """Check if user has a specific permission at a location."""
        role = self.get_role_at(location)
        if role is None:
            return False
        return role.has_permission(permission)


class Role(models.Model):
    """
    Defines what a user can do. Roles are org-level so they're consistent
    across all locations, but assigned per-location via UserLocationRole.

    Default roles: Owner, Content Manager, Staff
    You can add custom roles like Shift Lead, Kitchen, etc.
    """

    class DefaultRoles(models.TextChoices):
        OWNER = "owner", "Owner"
        CONTENT_MANAGER = "content_manager", "Content Manager"
        STAFF = "staff", "Staff"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, related_name="roles"
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField()
    description = models.TextField(blank=True)
    permissions = models.JSONField(
        default=dict,
        help_text="""
        Permission flags. Example:
        {
            "memos": {"create": true, "read": true, "update": true, "delete": true, "acknowledge": true},
            "inventory": {"create": true, "read": true, "update": true, "stock_take": true},
            "waste": {"create": true, "read": true, "view_reports": true},
            "datechecks": {"create": true, "read": true, "resolve_alerts": true, "manage_schedule": true},
            "training": {"create": true, "read": true, "update": true, "delete": true, "assign": true, "complete": true},
            "sales": {"view_dashboard": true, "view_financials": true, "export": true},
            "users": {"invite": true, "manage": true, "view": true},
            "settings": {"manage_location": true, "manage_org": true}
        }
        """,
    )
    is_system_role = models.BooleanField(
        default=False,
        help_text="System roles (Owner, CM, Staff) cannot be deleted",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("organisation", "slug")
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.organisation.name})"

    def has_permission(self, permission_path):
        """
        Check a dotted permission path, e.g. 'memos.create' or 'sales.view_dashboard'.
        Owner role returns True for everything.
        """
        if self.slug == "owner":
            return True
        parts = permission_path.split(".")
        node = self.permissions
        for part in parts:
            if isinstance(node, dict):
                node = node.get(part)
            else:
                return False
        return bool(node)


class UserLocationRole(models.Model):
    """
    The junction table that ties users to locations with specific roles.
    This is THE key table — a user's permissions are always resolved by checking
    'what role does this user have at THIS location?'

    A user can have different roles at different locations:
    - Alex: CM at Aberdeen, Staff at Edinburgh
    - Jordan: Owner at all locations
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="user_location_roles"
    )
    location = models.ForeignKey(
        Location, on_delete=models.CASCADE, related_name="user_location_roles"
    )
    role = models.ForeignKey(
        Role, on_delete=models.PROTECT, related_name="user_location_roles"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="role_assignments_made",
    )

    class Meta:
        unique_together = ("user", "location")  # One role per user per location
        ordering = ["user__username", "location__name"]

    def __str__(self):
        return f"{self.user.username} → {self.role.name} @ {self.location.name}"
