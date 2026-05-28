from rest_framework import serializers

from core.models import Location


class LocationSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name", read_only=True
    )

    class Meta:
        model = Location
        fields = (
            "id",
            "name",
            "slug",
            "address",
            "phone",
            "email",
            "opening_hours",
            "timezone",
            "is_active",
            "organisation_name",
        )
        read_only_fields = fields
