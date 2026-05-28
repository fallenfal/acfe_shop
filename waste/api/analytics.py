"""Waste reporting and aggregation helpers."""

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Case, CharField, Count, F, Sum, Value, When
from django.db.models.functions import TruncDate
from django.utils import timezone

from sales.models import Sale
from waste.models import WasteEntry


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


def resolve_period_range(request):
    """
    Resolve (start_dt, end_dt) from period and/or date_from/date_to query params.
    end_dt is inclusive through end of day when date_to is a date string.
    """
    now = timezone.now()
    period = (request.query_params.get("period") or "").lower()
    date_from = request.query_params.get("date_from")
    date_to = request.query_params.get("date_to")

    if date_from or date_to:
        start_date = _parse_date(date_from) or _parse_date(date_to)
        end_date = _parse_date(date_to) or start_date
        if start_date > end_date:
            start_date, end_date = end_date, start_date
        start_dt = timezone.make_aware(datetime.combine(start_date, time.min))
        end_dt = timezone.make_aware(datetime.combine(end_date, time.max))
        return start_dt, end_dt

    if period == "day":
        start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start_dt, now
    if period == "week":
        return now - timedelta(days=7), now
    if period == "month":
        return now - timedelta(days=30), now

    return now - timedelta(days=7), now


def filter_waste_queryset(queryset, start_dt, end_dt):
    return queryset.filter(logged_at__gte=start_dt, logged_at__lte=end_dt)


def aggregate_revenue(location, start_dt, end_dt):
    total = (
        Sale.objects.filter(
            location=location,
            timestamp__gte=start_dt,
            timestamp__lte=end_dt,
        ).aggregate(total=Sum("total_amount"))["total"]
    )
    return total or Decimal("0")


def build_waste_summary(location, queryset, start_dt, end_dt):
    qs = filter_waste_queryset(queryset, start_dt, end_dt)
    totals = qs.aggregate(
        total_waste_cost=Sum("cost_value"),
        total_waste_count=Count("id"),
    )
    total_waste_cost = totals["total_waste_cost"] or Decimal("0")
    total_waste_count = totals["total_waste_count"] or 0

    waste_by_reason = list(
        qs.values("reason")
        .annotate(
            total_cost=Sum("cost_value"),
            count=Count("id"),
        )
        .order_by("-total_cost")
    )
    for row in waste_by_reason:
        row["total_cost"] = float(row["total_cost"] or 0)

    item_qs = (
        qs.annotate(
            item_name=Case(
                When(
                    item_type=WasteEntry.ItemType.MENU_ITEM,
                    then=F("menu_item__name"),
                ),
                When(
                    item_type=WasteEntry.ItemType.STOCK_ITEM,
                    then=F("stock_item__name"),
                ),
                default=Value("Unknown"),
                output_field=CharField(),
            ),
        )
        .values("item_name", "item_type")
        .annotate(total_cost=Sum("cost_value"), count=Count("id"))
        .order_by("-total_cost")[:10]
    )
    waste_by_item = [
        {
            "item_name": row["item_name"],
            "item_type": row["item_type"],
            "total_cost": float(row["total_cost"] or 0),
            "count": row["count"],
        }
        for row in item_qs
    ]

    waste_by_shift = list(
        qs.values("shift")
        .annotate(total_cost=Sum("cost_value"), count=Count("id"))
        .order_by("shift")
    )
    for row in waste_by_shift:
        row["total_cost"] = float(row["total_cost"] or 0)

    expired_qs = qs.filter(reason=WasteEntry.Reason.EXPIRED)
    other_qs = qs.exclude(reason=WasteEntry.Reason.EXPIRED)
    expired_totals = expired_qs.aggregate(
        total_cost=Sum("cost_value"), count=Count("id")
    )
    other_totals = other_qs.aggregate(
        total_cost=Sum("cost_value"), count=Count("id")
    )
    waste_expired_breakdown = {
        "expired": {
            "total_cost": float(expired_totals["total_cost"] or 0),
            "count": expired_totals["count"] or 0,
        },
        "other": {
            "total_cost": float(other_totals["total_cost"] or 0),
            "count": other_totals["count"] or 0,
        },
    }

    revenue = aggregate_revenue(location, start_dt, end_dt)
    waste_as_percentage_of_revenue = None
    if revenue > 0:
        waste_as_percentage_of_revenue = round(
            float(total_waste_cost / revenue * 100), 2
        )

    return {
        "period_start": start_dt.isoformat(),
        "period_end": end_dt.isoformat(),
        "total_waste_cost": float(total_waste_cost),
        "total_waste_count": total_waste_count,
        "total_revenue": float(revenue),
        "waste_by_reason": waste_by_reason,
        "waste_by_item": waste_by_item,
        "waste_by_shift": waste_by_shift,
        "waste_expired_breakdown": waste_expired_breakdown,
        "waste_as_percentage_of_revenue": waste_as_percentage_of_revenue,
    }


def build_waste_trends(location, queryset, *, days=None, start_dt=None, end_dt=None):
    now = timezone.now()
    if start_dt is not None and end_dt is not None:
        range_start, range_end = start_dt, end_dt
        period_days = max((end_dt.date() - start_dt.date()).days + 1, 1)
    else:
        if days not in (30, 60, 90):
            days = 30
        period_days = days
        range_start = now - timedelta(days=days)
        range_end = now
    qs = filter_waste_queryset(
        queryset.filter(location=location),
        range_start,
        range_end,
    )
    daily = (
        qs.annotate(date=TruncDate("logged_at"))
        .values("date")
        .annotate(total_cost=Sum("cost_value"), count=Count("id"))
        .order_by("date")
    )
    return {
        "days": period_days,
        "data": [
            {
                "date": row["date"].isoformat(),
                "total_cost": float(row["total_cost"] or 0),
                "count": row["count"],
            }
            for row in daily
        ],
    }


def build_org_waste_comparison(organisation, start_dt, end_dt):
    from core.models import Location

    locations = Location.objects.filter(organisation=organisation, is_active=True)
    results = []
    for location in locations:
        qs = WasteEntry.objects.filter(location=location)
        summary = build_waste_summary(location, qs, start_dt, end_dt)
        results.append(
            {
                "location_id": str(location.id),
                "location_name": location.name,
                "total_waste_cost": summary["total_waste_cost"],
                "total_waste_count": summary["total_waste_count"],
                "total_revenue": summary["total_revenue"],
                "waste_as_percentage_of_revenue": summary[
                    "waste_as_percentage_of_revenue"
                ],
            }
        )
    results.sort(key=lambda r: r["total_waste_cost"], reverse=True)
    return {
        "period_start": start_dt.isoformat(),
        "period_end": end_dt.isoformat(),
        "locations": results,
    }
