from rest_framework import serializers

from sales.models import MenuItem
from inventory.models import StockItem
from waste.models import WasteEntry


class WasteEntrySerializer(serializers.ModelSerializer):
    menu_item_name = serializers.CharField(
        source="menu_item.name", read_only=True, allow_null=True
    )
    stock_item_name = serializers.CharField(
        source="stock_item.name", read_only=True, allow_null=True
    )
    logged_by_name = serializers.SerializerMethodField()
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)
    shift_display = serializers.CharField(source="get_shift_display", read_only=True)

    class Meta:
        model = WasteEntry
        fields = (
            "id",
            "location",
            "item_type",
            "menu_item",
            "menu_item_name",
            "stock_item",
            "stock_item_name",
            "quantity",
            "unit",
            "reason",
            "reason_display",
            "reason_note",
            "shift",
            "shift_display",
            "cost_value",
            "photo",
            "logged_by",
            "logged_by_name",
            "logged_at",
        )
        read_only_fields = (
            "id",
            "location",
            "cost_value",
            "logged_by",
            "logged_by_name",
            "logged_at",
            "reason_display",
            "shift_display",
            "menu_item_name",
            "stock_item_name",
        )

    def get_logged_by_name(self, obj):
        if obj.logged_by is None:
            return None
        return obj.logged_by.get_full_name() or obj.logged_by.username


class WasteEntryCreateSerializer(serializers.Serializer):
    item_type = serializers.ChoiceField(choices=WasteEntry.ItemType.choices)
    menu_item = serializers.UUIDField(required=False, allow_null=True)
    stock_item = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.FloatField(min_value=0.01)
    unit = serializers.CharField(max_length=20)
    reason = serializers.ChoiceField(choices=WasteEntry.Reason.choices)
    reason_note = serializers.CharField(required=False, allow_blank=True, default="")
    shift = serializers.ChoiceField(choices=WasteEntry.Shift.choices)
    photo = serializers.ImageField(required=False, allow_null=True)

    def validate(self, attrs):
        item_type = attrs["item_type"]
        menu_item_id = attrs.get("menu_item")
        stock_item_id = attrs.get("stock_item")

        if item_type == WasteEntry.ItemType.MENU_ITEM:
            if not menu_item_id:
                raise serializers.ValidationError(
                    {"menu_item": "Required for menu item waste."}
                )
            if stock_item_id:
                raise serializers.ValidationError(
                    {"stock_item": "Must be empty for menu item waste."}
                )
        elif item_type == WasteEntry.ItemType.STOCK_ITEM:
            if not stock_item_id:
                raise serializers.ValidationError(
                    {"stock_item": "Required for stock item waste."}
                )
            if menu_item_id:
                raise serializers.ValidationError(
                    {"menu_item": "Must be empty for stock item waste."}
                )
        return attrs

    def resolve_items(self, location):
        data = self.validated_data
        item_type = data["item_type"]
        org = location.organisation
        menu_item = None
        stock_item = None

        if item_type == WasteEntry.ItemType.MENU_ITEM:
            try:
                menu_item = MenuItem.objects.get(
                    pk=data["menu_item"],
                    organisation=org,
                    is_active=True,
                )
            except MenuItem.DoesNotExist as exc:
                raise serializers.ValidationError(
                    {"menu_item": "Menu item not found."}
                ) from exc
        else:
            try:
                stock_item = StockItem.objects.get(
                    pk=data["stock_item"],
                    organisation=org,
                    is_active=True,
                )
            except StockItem.DoesNotExist as exc:
                raise serializers.ValidationError(
                    {"stock_item": "Stock item not found."}
                ) from exc

        return menu_item, stock_item
