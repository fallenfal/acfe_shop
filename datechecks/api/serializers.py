from rest_framework import serializers

from datechecks.models import (
    DateCheck,
    DateCheckEntry,
    DateCheckSchedule,
    ExpiryAlert,
)
from inventory.models import StockItem
from sales.models import MenuItem


class DateCheckListSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)
    conducted_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DateCheck
        fields = (
            "id",
            "location_name",
            "conducted_by_name",
            "status",
            "items_checked",
            "items_expired",
            "items_expiring_soon",
            "started_at",
            "completed_at",
        )

    def get_conducted_by_name(self, obj):
        if obj.conducted_by is None:
            return None
        return obj.conducted_by.get_full_name() or obj.conducted_by.username


class DateCheckEntrySerializer(serializers.ModelSerializer):
    days_until_expiry = serializers.SerializerMethodField()
    stock_item_id = serializers.UUIDField(
        source="stock_item.id", read_only=True, allow_null=True
    )
    menu_item_id = serializers.UUIDField(
        source="menu_item.id", read_only=True, allow_null=True
    )

    class Meta:
        model = DateCheckEntry
        fields = (
            "id",
            "date_check",
            "stock_item",
            "stock_item_id",
            "menu_item",
            "menu_item_id",
            "product_name",
            "earliest_expiry",
            "quantity_at_risk",
            "unit",
            "estimated_cost",
            "expiry_status",
            "action_taken",
            "action_note",
            "photo",
            "days_until_expiry",
            "created_at",
        )
        read_only_fields = (
            "id",
            "date_check",
            "estimated_cost",
            "expiry_status",
            "created_at",
            "days_until_expiry",
            "stock_item_id",
            "menu_item_id",
        )

    def get_days_until_expiry(self, obj):
        from datetime import date

        return (obj.earliest_expiry - date.today()).days


class DateCheckDetailSerializer(DateCheckListSerializer):
    notes = serializers.CharField()
    conducted_by = serializers.UUIDField(
        source="conducted_by_id", read_only=True, allow_null=True
    )
    entries = DateCheckEntrySerializer(many=True, read_only=True)

    class Meta(DateCheckListSerializer.Meta):
        fields = DateCheckListSerializer.Meta.fields + (
            "notes",
            "conducted_by",
            "entries",
        )


class DateCheckCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DateCheck
        fields = ("notes",)


class DateCheckEntryCreateSerializer(serializers.Serializer):
    stock_item_id = serializers.UUIDField(required=False, allow_null=True)
    menu_item_id = serializers.UUIDField(required=False, allow_null=True)
    product_name = serializers.CharField(
        max_length=200, required=False, allow_blank=True, default=""
    )
    earliest_expiry = serializers.DateField()
    quantity_at_risk = serializers.FloatField(min_value=0, default=1)
    unit = serializers.CharField(max_length=20, required=False, default="units")
    photo = serializers.ImageField(required=False, allow_null=True)
    action_taken = serializers.ChoiceField(
        choices=DateCheckEntry.Action.choices,
        required=False,
        default=DateCheckEntry.Action.NONE,
    )
    action_note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        stock_item_id = attrs.get("stock_item_id")
        menu_item_id = attrs.get("menu_item_id")
        product_name = (attrs.get("product_name") or "").strip()

        if stock_item_id and menu_item_id:
            raise serializers.ValidationError(
                "Provide only one of stock_item_id or menu_item_id."
            )
        if not stock_item_id and not menu_item_id and not product_name:
            raise serializers.ValidationError(
                "Provide stock_item_id, menu_item_id, or product_name."
            )
        return attrs


class DateCheckEntryUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DateCheckEntry
        fields = (
            "earliest_expiry",
            "quantity_at_risk",
            "unit",
            "action_taken",
            "action_note",
            "photo",
        )


class DateCheckEntryBatchSerializer(serializers.Serializer):
    entries = DateCheckEntryCreateSerializer(many=True, allow_empty=False)


class ExpiryAlertSerializer(serializers.ModelSerializer):
    days_until_expiry = serializers.IntegerField(read_only=True)
    alert_level_display = serializers.CharField(
        source="get_alert_level_display", read_only=True
    )
    resolution_display = serializers.CharField(
        source="get_resolution_display", read_only=True
    )
    resolved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ExpiryAlert
        fields = (
            "id",
            "location",
            "date_check_entry",
            "product_name",
            "expiry_date",
            "quantity_at_risk",
            "estimated_cost",
            "alert_level",
            "alert_level_display",
            "resolution",
            "resolution_display",
            "resolved_by",
            "resolved_by_name",
            "resolved_at",
            "resolved_note",
            "waste_entry",
            "days_until_expiry",
            "created_at",
        )
        read_only_fields = fields

    def get_resolved_by_name(self, obj):
        if obj.resolved_by is None:
            return None
        return obj.resolved_by.get_full_name() or obj.resolved_by.username


class ExpiryAlertResolveSerializer(serializers.Serializer):
    resolution = serializers.ChoiceField(
        choices=[
            ExpiryAlert.Resolution.USED,
            ExpiryAlert.Resolution.DISPOSED,
            ExpiryAlert.Resolution.WASTED,
            ExpiryAlert.Resolution.RECHECKED,
            ExpiryAlert.Resolution.DISMISSED,
        ]
    )
    resolved_note = serializers.CharField(required=False, allow_blank=True, default="")


class ExpiryAlertBulkResolveSerializer(ExpiryAlertResolveSerializer):
    alert_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False
    )


class DateCheckScheduleSerializer(serializers.ModelSerializer):
    is_overdue = serializers.BooleanField(read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = DateCheckSchedule
        fields = (
            "id",
            "location",
            "location_name",
            "frequency",
            "alert_threshold_days",
            "reminder_enabled",
            "reminder_time",
            "last_check_at",
            "is_overdue",
            "updated_at",
        )
        read_only_fields = ("id", "location", "location_name", "last_check_at", "is_overdue", "updated_at")


class DateCheckScheduleUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DateCheckSchedule
        fields = (
            "frequency",
            "alert_threshold_days",
            "reminder_enabled",
            "reminder_time",
        )
