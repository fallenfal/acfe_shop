from rest_framework import serializers

from sales.models import Sale, SaleItem


class SaleItemSerializer(serializers.ModelSerializer):
    menu_item_name = serializers.CharField(
        source="menu_item.name", read_only=True, allow_null=True
    )

    class Meta:
        model = SaleItem
        fields = (
            "id",
            "menu_item",
            "menu_item_name",
            "quantity",
            "unit_price",
            "line_total",
        )
        read_only_fields = fields


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)

    class Meta:
        model = Sale
        fields = (
            "id",
            "location",
            "transaction_ref",
            "timestamp",
            "total_amount",
            "payment_method",
            "items",
            "created_at",
        )
        read_only_fields = fields
