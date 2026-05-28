from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.models import Organisation, Role

User = get_user_model()


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Accept email + password instead of username."""

    email = serializers.EmailField(write_only=True)
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop(self.username_field, None)

    def validate(self, attrs):
        email = attrs["email"]
        password = attrs["password"]

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise serializers.ValidationError(
                {"detail": "No active account found with the given credentials."}
            ) from None

        if not user.check_password(password):
            raise serializers.ValidationError(
                {"detail": "No active account found with the given credentials."}
            )

        if not user.is_active:
            raise serializers.ValidationError({"detail": "User account is disabled."})

        refresh = self.get_token(user)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }


class OrganisationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organisation
        fields = ("id", "name")


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ("name", "slug", "permissions")


class UserProfileSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    organisation = serializers.SerializerMethodField()
    locations = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "name",
            "phone",
            "avatar_url",
            "organisation",
            "locations",
        )
        read_only_fields = fields

    def get_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_avatar_url(self, obj):
        if not obj.avatar:
            return None
        request = self.context.get("request")
        url = obj.avatar.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url

    def get_organisation(self, obj):
        if obj.organisation_id is None:
            return None
        return OrganisationSerializer(obj.organisation).data

    def get_locations(self, obj):
        assignments = (
            obj.user_location_roles.select_related("location", "role")
            .filter(location__is_active=True)
            .order_by("location__name")
        )
        return [
            {
                "id": assignment.location.id,
                "name": assignment.location.name,
                "role": RoleSerializer(assignment.role).data,
            }
            for assignment in assignments
        ]


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    name = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ("name", "phone", "avatar")

    def update(self, instance, validated_data):
        name = validated_data.pop("name", None)
        if name is not None:
            parts = name.strip().split(None, 1)
            instance.first_name = parts[0] if parts else ""
            instance.last_name = parts[1] if len(parts) > 1 else ""

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance
