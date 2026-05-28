from rest_framework import serializers

from sales.models import MenuItem


class MenuItemListSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = ("id", "name", "category", "ingredient_cost", "price")
        read_only_fields = fields
