from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from core.api.location_serializers import LocationSerializer
from core.models import Location
from core.permissions import get_user_location_role


class LocationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/locations/ — locations the current user can access
    GET /api/locations/{id}/ — location detail
    """

    permission_classes = [IsAuthenticated]
    serializer_class = LocationSerializer
    lookup_field = "pk"

    def get_queryset(self):
        return (
            Location.objects.filter(
                user_location_roles__user=self.request.user,
                is_active=True,
            )
            .select_related("organisation")
            .distinct()
            .order_by("name")
        )

    def get_object(self):
        obj = super().get_object()
        if get_user_location_role(self.request.user, obj) is None:
            from rest_framework.exceptions import NotFound

            raise NotFound()
        return obj
