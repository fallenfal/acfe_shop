"""Org-wide permission checks for training endpoints without a location in the URL."""

from rest_framework.permissions import BasePermission

from core.models import UserLocationRole
from core.permissions import user_is_org_owner


def user_has_org_permission(user, permission_path):
    """True if the user is owner or has permission_path at any location in their org."""
    org = getattr(user, "organisation", None)
    if org is None or not user.is_authenticated:
        return False
    if user_is_org_owner(user, org):
        return True
    for assignment in UserLocationRole.objects.filter(
        user=user, location__organisation=org
    ).select_related("role"):
        if assignment.role.has_permission(permission_path):
            return True
    return False


def OrgPermissionRequired(permission_path):
    class _OrgPermissionRequired(BasePermission):
        message = f"You do not have permission: {permission_path}"

        def has_permission(self, request, view):
            return user_has_org_permission(request.user, permission_path)

    _OrgPermissionRequired.__name__ = f"OrgPermissionRequired_{permission_path.replace('.', '_')}"
    _OrgPermissionRequired.__qualname__ = _OrgPermissionRequired.__name__
    return _OrgPermissionRequired
