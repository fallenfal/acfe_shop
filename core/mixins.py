"""
ViewSet mixins for location-scoped API resources.
"""

from django.db.models import Q
from rest_framework.exceptions import NotFound, PermissionDenied

from core.permissions import (
    get_location_by_id,
    get_user_location_role,
    is_all_locations_id,
    resolve_location_id,
    user_is_org_owner,
)


class LocationScopedMixin:
    """
    ViewSet mixin for resources scoped to a location.

    - Reads location_id from URL kwargs or ?location_id= query param
    - Validates the user has access (Owner may use location_id='all')
    - Filters querysets to the active location (or org locations when 'all')
    - Sets the location FK on create/update
  """

    location_kwarg = "location_id"
    location_field = "location"
    organisation_field = None
    include_org_wide = False

    def initial(self, request, *args, **kwargs):
        self.location = None
        self.user_location_role = None
        self.all_locations = False
        self._resolve_location_scope(request)
        super().initial(request, *args, **kwargs)

    def _resolve_location_scope(self, request):
        location_id = resolve_location_id(self, request)

        if location_id is None:
            raise NotFound("location_id is required.")

        if is_all_locations_id(location_id):
            if not user_is_org_owner(
                request.user, getattr(request.user, "organisation", None)
            ):
                raise PermissionDenied("Only owners may use cross-location access.")
            self.all_locations = True
            return

        location = get_location_by_id(location_id)
        if location is None:
            raise NotFound("Location not found.")

        assignment = get_user_location_role(request.user, location)
        if assignment is None:
            raise PermissionDenied("You do not have access to this location.")

        self.location = location
        self.user_location_role = assignment

    def _organisation_for_scope(self):
        if self.location is not None:
            return self.location.organisation
        return getattr(self.request.user, "organisation", None)

    def get_queryset(self):
        queryset = super().get_queryset()

        if self.all_locations:
            organisation = self._organisation_for_scope()
            if organisation is None:
                return queryset.none()
            if self.organisation_field:
                return queryset.filter(**{self.organisation_field: organisation})
            if self.location_field:
                location_ids = self.request.user.get_locations().values_list(
                    "pk", flat=True
                )
                return queryset.filter(**{f"{self.location_field}_id__in": location_ids})
            return queryset

        if self.location is None:
            return queryset.none()

        if self.include_org_wide and self.location_field:
            org = self.location.organisation
            return queryset.filter(
                Q(**{self.location_field: self.location})
                | Q(**{self.location_field: None, "organisation": org})
            )

        return queryset.filter(**{self.location_field: self.location})

    def perform_create(self, serializer):
        save_kwargs = {}
        if self.location_field and not self.all_locations and self.location:
            save_kwargs[self.location_field] = self.location
        if self.organisation_field and self.location:
            save_kwargs[self.organisation_field] = self.location.organisation
        elif self.organisation_field and self._organisation_for_scope():
            save_kwargs[self.organisation_field] = self._organisation_for_scope()
        serializer.save(**save_kwargs)

    def perform_update(self, serializer):
        if self.all_locations:
            serializer.save()
            return
        save_kwargs = {}
        if self.location_field and self.location:
            save_kwargs[self.location_field] = self.location
        serializer.save(**save_kwargs)
