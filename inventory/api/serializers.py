from rest_framework import serializers

from inventory.models import (
    LocationStock,
    StockAdjustment,
    StockItem,
    StockTake,
    StockTakeEntry,
)


class StockItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockItem
        fields = (
            "id",
            "name",
            "category",
            "unit",
            "preferred_suppliers",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "created_at")


class StockItemDateCheckHistorySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    check_date = serializers.DateTimeField()
    earliest_expiry = serializers.DateField()
    expiry_status = serializers.CharField()
    action_taken = serializers.CharField()
    action_taken_display = serializers.CharField()


class LocationStockListSerializer(serializers.ModelSerializer):
    stock_item_id = serializers.UUIDField(source="stock_item.id", read_only=True)
    name = serializers.CharField(source="stock_item.name", read_only=True)
    category = serializers.CharField(source="stock_item.category", read_only=True)
    unit = serializers.CharField(source="stock_item.unit", read_only=True)
    is_below_par = serializers.BooleanField(read_only=True)
    stock_value = serializers.FloatField(read_only=True)
    latest_expiry_date = serializers.DateField(read_only=True, allow_null=True)
    latest_expiry_status = serializers.CharField(read_only=True, allow_null=True)

    class Meta:
        model = LocationStock
        fields = (
            "id",
            "stock_item_id",
            "name",
            "category",
            "unit",
            "current_quantity",
            "par_level",
            "unit_cost",
            "is_below_par",
            "stock_value",
            "last_counted_at",
            "updated_at",
            "latest_expiry_date",
            "latest_expiry_status",
        )


class StockAdjustmentSerializer(serializers.ModelSerializer):
    stock_item_name = serializers.CharField(source="stock_item.name", read_only=True)
    related_location_name = serializers.CharField(
        source="related_location.name", read_only=True, allow_null=True
    )
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StockAdjustment
        fields = (
            "id",
            "stock_item",
            "stock_item_name",
            "adjustment_type",
            "quantity_change",
            "related_location",
            "related_location_name",
            "notes",
            "created_by",
            "created_by_name",
            "created_at",
        )
        read_only_fields = fields

    def get_created_by_name(self, obj):
        if obj.created_by is None:
            return None
        return obj.created_by.get_full_name() or obj.created_by.username


class LocationStockDetailSerializer(LocationStockListSerializer):
    adjustments = StockAdjustmentSerializer(many=True, read_only=True)

    class Meta(LocationStockListSerializer.Meta):
        fields = LocationStockListSerializer.Meta.fields + ("adjustments",)


class LocationStockUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocationStock
        fields = ("par_level", "unit_cost")


class StockAdjustmentCreateSerializer(serializers.Serializer):
    stock_item_id = serializers.UUIDField()
    adjustment_type = serializers.ChoiceField(
        choices=[
            StockAdjustment.AdjustmentType.DELIVERY,
            StockAdjustment.AdjustmentType.CORRECTION,
            StockAdjustment.AdjustmentType.TRANSFER_OUT,
        ]
    )
    quantity = serializers.FloatField(
        required=False,
        help_text="Positive amount for delivery or transfer.",
    )
    quantity_change = serializers.FloatField(
        required=False,
        help_text="Signed change for corrections.",
    )
    related_location_id = serializers.UUIDField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        adj_type = attrs["adjustment_type"]
        if adj_type == StockAdjustment.AdjustmentType.CORRECTION:
            if attrs.get("quantity_change") is None:
                raise serializers.ValidationError(
                    {"quantity_change": "Required for corrections."}
                )
        else:
            qty = attrs.get("quantity")
            if qty is None or qty <= 0:
                raise serializers.ValidationError(
                    {"quantity": "Must be greater than zero."}
                )
        if adj_type == StockAdjustment.AdjustmentType.TRANSFER_OUT:
            if not attrs.get("related_location_id"):
                raise serializers.ValidationError(
                    {"related_location_id": "Required for transfers."}
                )
        return attrs


class StockTakeEntryInputSerializer(serializers.Serializer):
    stock_item_id = serializers.UUIDField()
    counted_quantity = serializers.FloatField(min_value=0)


class StockTakeEntriesSubmitSerializer(serializers.Serializer):
    entries = StockTakeEntryInputSerializer(many=True, allow_empty=False)


class StockTakeEntrySerializer(serializers.ModelSerializer):
    stock_item_name = serializers.CharField(source="stock_item.name", read_only=True)
    stock_item_category = serializers.CharField(
        source="stock_item.category", read_only=True
    )
    stock_item_unit = serializers.CharField(source="stock_item.unit", read_only=True)

    class Meta:
        model = StockTakeEntry
        fields = (
            "id",
            "stock_item",
            "stock_item_name",
            "stock_item_category",
            "stock_item_unit",
            "counted_quantity",
            "expected_quantity",
            "variance",
        )


class StockTakeListSerializer(serializers.ModelSerializer):
    conducted_by_name = serializers.SerializerMethodField()
    items_counted = serializers.IntegerField(read_only=True)
    total_variance = serializers.FloatField(read_only=True)

    class Meta:
        model = StockTake
        fields = (
            "id",
            "conducted_at",
            "conducted_by",
            "conducted_by_name",
            "notes",
            "items_counted",
            "total_variance",
        )

    def get_conducted_by_name(self, obj):
        if obj.conducted_by is None:
            return None
        return obj.conducted_by.get_full_name() or obj.conducted_by.username


class StockTakeDetailSerializer(StockTakeListSerializer):
    entries = StockTakeEntrySerializer(many=True, read_only=True)

    class Meta(StockTakeListSerializer.Meta):
        fields = StockTakeListSerializer.Meta.fields + ("entries",)


class StockTakeCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockTake
        fields = ("notes",)
