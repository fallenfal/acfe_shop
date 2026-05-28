"""
Multi-location access control for DRF views.
"""

from uuid import UUID

from rest_framework.permissions import BasePermission

from core.models import Location, UserLocationRole

ALL_LOCATIONS_ID = "all"


def get_user_location_role(user, location):
    """Return the user's UserLocationRole at a location, or None."""
    if user is None or not user.is_authenticated or location is None:
        return None
    return (
        UserLocationRole.objects.filter(user=user, location=location)
        .select_related("role", "location")
        .first()
    )


CM_OR_ABOVE_ROLE_SLUGS = frozenset({"owner", "content_manager"})


def user_is_cm_or_above(user, location):
    """True if the user is Content Manager or Owner at the given location."""
    assignment = get_user_location_role(user, location)
    if assignment is None:
        return False
    return assignment.role.slug in CM_OR_ABOVE_ROLE_SLUGS


def user_is_org_owner(user, organisation=None):
    """True if the user holds the Owner role at any (optionally org-scoped) location."""
    if user is None or not user.is_authenticated:
        return False
    qs = UserLocationRole.objects.filter(user=user, role__slug="owner")
    if organisation is not None:
        qs = qs.filter(location__organisation=organisation)
    return qs.exists()


def resolve_location_id(view, request):
    """
    Resolve location_id from URL kwargs, query params, or request body.
    Returns the raw string/UUID value, or None if not present.
    """
    location_kwarg = getattr(view, "location_kwarg", "location_id")

    location_id = view.kwargs.get(location_kwarg) if hasattr(view, "kwargs") else None
    if location_id is not None:
        return str(location_id)

    if request is not None:
        if hasattr(request, "query_params"):
            location_id = request.query_params.get(location_kwarg)
            if location_id is not None:
                return str(location_id)
        data = getattr(request, "data", None)
        if data and location_kwarg in data:
            return str(data[location_kwarg])

    return None


def is_all_locations_id(location_id):
    return location_id is not None and str(location_id).lower() == ALL_LOCATIONS_ID


def get_location_by_id(location_id):
    """Load an active Location by UUID string, or None."""
    try:
        UUID(str(location_id))
    except (TypeError, ValueError):
        return None
    return Location.objects.filter(pk=location_id, is_active=True).first()


def resolve_active_location(view, request):
    """
    Return the active Location for the request, or None when using cross-location
    'all' scope (Owner only). Sets view.all_locations when applicable.
    """
    if getattr(view, "location", None) is not None:
        return view.location

    if getattr(view, "all_locations", False):
        return None

    location_id = resolve_location_id(view, request)
    if location_id is None:
        return None

    if is_all_locations_id(location_id):
        return None

    return get_location_by_id(location_id)


def check_user_permission(user, permission_path, location=None, view=None):
    """
    Check permission_path (e.g. 'memos.create') for the user at a location.
    When view.all_locations is True, Owner role permissions apply org-wide.
    """
    if view is not None and getattr(view, "all_locations", False):
        if not user_is_org_owner(user, getattr(user, "organisation", None)):
            return False
        owner_assignment = (
            UserLocationRole.objects.filter(user=user, role__slug="owner")
            .select_related("role")
            .first()
        )
        if owner_assignment is None:
            return False
        return owner_assignment.role.has_permission(permission_path)

    if location is None:
        return False

    return user.has_permission_at(location, permission_path)


class LocationPermission(BasePermission):
    """
    Ensures the authenticated user has a role at the requested location.
    Location is read from URL kwargs (location_id), query params, or request data.
    Owners may use location_id='all' for cross-location access.
    """

    message = "You do not have access to this location."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Mixin may have already resolved scope
        if getattr(view, "user_location_role", None) is not None:
            return True
        if getattr(view, "all_locations", False):
            return user_is_org_owner(
                request.user, getattr(request.user, "organisation", None)
            )

        location_id = resolve_location_id(view, request)
        if location_id is None:
            return False

        if is_all_locations_id(location_id):
            return user_is_org_owner(
                request.user, getattr(request.user, "organisation", None)
            )

        location = get_location_by_id(location_id)
        if location is None:
            return False

        assignment = get_user_location_role(request.user, location)
        if assignment is None:
            return False

        view.location = location
        view.user_location_role = assignment
        return True


def PermissionRequired(permission_path):
    """
    Factory returning a permission class that checks permission_path at the
    active location, e.g. PermissionRequired("memos.create").
    """

    class _PermissionRequired(BasePermission):
        message = f"You do not have permission: {permission_path}"

        def has_permission(self, request, view):
            if not request.user or not request.user.is_authenticated:
                return False

            location = resolve_active_location(view, request)
            if location is None and not getattr(view, "all_locations", False):
                location_id = resolve_location_id(view, request)
                if location_id and not is_all_locations_id(location_id):
                    location = get_location_by_id(location_id)
                    if location:
                        view.location = location

            return check_user_permission(
                request.user,
                permission_path,
                location=location,
                view=view,
            )

    _PermissionRequired.__name__ = f"PermissionRequired_{permission_path.replace('.', '_')}"
    _PermissionRequired.__qualname__ = _PermissionRequired.__name__
    return _PermissionRequired


def get_location_or_404(location_id, user):
    """Resolve a location the user may access, or raise Http404."""
    if is_all_locations_id(location_id):
        if not user_is_org_owner(user, getattr(user, "organisation", None)):
            from rest_framework.exceptions import NotFound

            raise NotFound("Location not found.")
        return None

    location = get_location_by_id(location_id)
    if location is None or get_user_location_role(user, location) is None:
        from rest_framework.exceptions import NotFound

        raise NotFound("Location not found.")
    return location
