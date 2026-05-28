"""Sales reporting and aggregation helpers."""

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, F, Sum
from django.db.models.functions import ExtractHour, TruncDate
from django.utils import timezone

from core.models import Location
from sales.models import DailySalesSummary, MenuItem, Sale, SaleItem
from waste.models import WasteEntry


def parse_date(value, *, default=None):
    if value is None:
        return default
    if hasattr(value, "date") and callable(getattr(value, "date", None)):
        if isinstance(value, datetime):
            return value.date()
        return value
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


def day_bounds(target_date):
    """Return (start_dt, end_dt) timezone-aware for a calendar date."""
    start_dt = timezone.make_aware(datetime.combine(target_date, time.min))
    end_dt = timezone.make_aware(datetime.combine(target_date, time.max))
    return start_dt, end_dt


def pct_change(current, previous):
    current_f = float(current or 0)
    previous_f = float(previous or 0)
    if previous_f == 0:
        return 0.0 if current_f == 0 else 100.0
    return round((current_f - previous_f) / previous_f * 100, 1)


def _sales_for_day(location, target_date):
    start_dt, end_dt = day_bounds(target_date)
    return Sale.objects.filter(
        location=location,
        timestamp__gte=start_dt,
        timestamp__lte=end_dt,
    )


def _day_metrics(location, target_date):
    sales_qs = _sales_for_day(location, target_date)
    agg = sales_qs.aggregate(
        total_revenue=Sum("total_amount"),
        transaction_count=Count("id"),
    )
    total_revenue = agg["total_revenue"] or Decimal("0")
    transaction_count = agg["transaction_count"] or 0
    if transaction_count:
        average_transaction = total_revenue / transaction_count
    else:
        average_transaction = Decimal("0")
    return {
        "total_revenue": float(total_revenue),
        "transaction_count": transaction_count,
        "average_transaction": float(round(average_transaction, 2)),
    }


def _hourly_breakdown_from_sales(location, target_date):
    start_dt, end_dt = day_bounds(target_date)
    rows = (
        Sale.objects.filter(
            location=location,
            timestamp__gte=start_dt,
            timestamp__lte=end_dt,
        )
        .annotate(hour=ExtractHour("timestamp"))
        .values("hour")
        .annotate(
            revenue=Sum("total_amount"),
            transactions=Count("id"),
        )
        .order_by("hour")
    )
    return [
        {
            "hour": row["hour"],
            "revenue": float(row["revenue"] or 0),
            "transactions": row["transactions"],
        }
        for row in rows
    ]


def _hourly_breakdown_from_summary(summary):
    raw = summary.hourly_breakdown or {}
    result = []
    for key, data in raw.items():
        hour = int(key) if str(key).isdigit() else int(str(key)[:2])
        result.append(
            {
                "hour": hour,
                "revenue": float(data.get("revenue", 0)),
                "transactions": data.get("transactions", 0),
            }
        )
    return sorted(result, key=lambda r: r["hour"])


def _top_items_from_sales(location, target_date, limit=10):
    start_dt, end_dt = day_bounds(target_date)
    rows = (
        SaleItem.objects.filter(
            sale__location=location,
            sale__timestamp__gte=start_dt,
            sale__timestamp__lte=end_dt,
        )
        .values("menu_item_id", "menu_item__name")
        .annotate(
            quantity=Sum("quantity"),
            revenue=Sum("line_total"),
        )
        .order_by("-revenue")[:limit]
    )
    return [
        {
            "item_id": str(row["menu_item_id"]) if row["menu_item_id"] else None,
            "name": row["menu_item__name"] or "Unknown",
            "quantity": row["quantity"] or 0,
            "revenue": float(row["revenue"] or 0),
        }
        for row in rows
    ]


def _top_items_from_summary(summary, limit=10):
    items = (summary.top_items or [])[:limit]
    return [
        {
            "item_id": item.get("item_id"),
            "name": item.get("name", "Unknown"),
            "quantity": item.get("quantity", item.get("qty", 0)),
            "revenue": float(item.get("revenue", 0)),
        }
        for item in items
    ]


def _category_breakdown_from_sales(location, target_date):
    start_dt, end_dt = day_bounds(target_date)
    rows = (
        SaleItem.objects.filter(
            sale__location=location,
            sale__timestamp__gte=start_dt,
            sale__timestamp__lte=end_dt,
            menu_item__isnull=False,
        )
        .values(category=F("menu_item__category"))
        .annotate(
            revenue=Sum("line_total"),
            quantity=Sum("quantity"),
        )
        .order_by("-revenue")
    )
    return [
        {
            "category": row["category"],
            "revenue": float(row["revenue"] or 0),
            "quantity": row["quantity"] or 0,
        }
        for row in rows
    ]


def _category_breakdown_from_summary(summary):
    raw = summary.category_breakdown or {}
    if isinstance(raw, list):
        return raw
    return [
        {
            "category": category,
            "revenue": float(data.get("revenue", 0)),
            "quantity": data.get("quantity", data.get("qty", 0)),
        }
        for category, data in raw.items()
    ]


def _waste_percentage(location, target_date):
    summary = DailySalesSummary.objects.filter(
        location=location, date=target_date
    ).first()
    if summary is not None:
        return float(summary.waste_percentage)

    start_dt, end_dt = day_bounds(target_date)
    waste_total = WasteEntry.objects.filter(
        location=location,
        logged_at__gte=start_dt,
        logged_at__lte=end_dt,
    ).aggregate(total=Sum("cost_value"))["total"] or Decimal("0")
    revenue = _day_metrics(location, target_date)["total_revenue"]
    if revenue > 0:
        return round(float(waste_total) / revenue * 100, 2)
    return 0.0


def _waste_percentage_for_range(location, start_date, end_date):
    summaries = DailySalesSummary.objects.filter(
        location=location,
        date__gte=start_date,
        date__lte=end_date,
    )
    if summaries.exists():
        totals = summaries.aggregate(
            waste_total=Sum("waste_total"),
            total_revenue=Sum("total_revenue"),
        )
        waste_total = totals["waste_total"] or Decimal("0")
        total_revenue = totals["total_revenue"] or Decimal("0")
    else:
        start_dt, _ = day_bounds(start_date)
        _, end_dt = day_bounds(end_date)
        waste_total = WasteEntry.objects.filter(
            location=location,
            logged_at__gte=start_dt,
            logged_at__lte=end_dt,
        ).aggregate(total=Sum("cost_value"))["total"] or Decimal("0")
        total_revenue = (
            Sale.objects.filter(
                location=location,
                timestamp__gte=start_dt,
                timestamp__lte=end_dt,
            ).aggregate(total=Sum("total_amount"))["total"]
            or Decimal("0")
        )
    if total_revenue > 0:
        return round(float(waste_total / total_revenue * 100), 2)
    return 0.0


def _slow_movers_for_location_ids(location_ids, target_date, limit=20):
    start_dt, end_dt = day_bounds(target_date)
    rows = (
        SaleItem.objects.filter(
            sale__location_id__in=location_ids,
            sale__timestamp__gte=start_dt,
            sale__timestamp__lte=end_dt,
            menu_item__isnull=False,
        )
        .values("menu_item_id", "menu_item__name")
        .annotate(
            quantity=Sum("quantity"),
            revenue=Sum("line_total"),
        )
        .filter(quantity__lt=5, quantity__gte=1)
        .order_by("quantity", "revenue")[:limit]
    )
    return [
        {
            "item_id": str(row["menu_item_id"]),
            "name": row["menu_item__name"],
            "quantity": row["quantity"] or 0,
            "revenue": float(row["revenue"] or 0),
        }
        for row in rows
    ]


def _slow_movers(location, target_date, limit=20):
    return _slow_movers_for_location_ids([location.pk], target_date, limit=limit)


def _hourly_breakdown_for_location_ids(location_ids, target_date):
    start_dt, end_dt = day_bounds(target_date)
    rows = (
        Sale.objects.filter(
            location_id__in=location_ids,
            timestamp__gte=start_dt,
            timestamp__lte=end_dt,
        )
        .annotate(hour=ExtractHour("timestamp"))
        .values("hour")
        .annotate(
            revenue=Sum("total_amount"),
            transactions=Count("id"),
        )
        .order_by("hour")
    )
    return [
        {
            "hour": row["hour"],
            "revenue": float(row["revenue"] or 0),
            "transactions": row["transactions"],
        }
        for row in rows
    ]


def _top_items_for_location_ids(location_ids, target_date, limit=10):
    start_dt, end_dt = day_bounds(target_date)
    rows = (
        SaleItem.objects.filter(
            sale__location_id__in=location_ids,
            sale__timestamp__gte=start_dt,
            sale__timestamp__lte=end_dt,
        )
        .values("menu_item_id", "menu_item__name")
        .annotate(
            quantity=Sum("quantity"),
            revenue=Sum("line_total"),
        )
        .order_by("-revenue")[:limit]
    )
    return [
        {
            "item_id": str(row["menu_item_id"]) if row["menu_item_id"] else None,
            "name": row["menu_item__name"] or "Unknown",
            "quantity": row["quantity"] or 0,
            "revenue": float(row["revenue"] or 0),
        }
        for row in rows
    ]


def _category_breakdown_for_location_ids(location_ids, target_date):
    start_dt, end_dt = day_bounds(target_date)
    rows = (
        SaleItem.objects.filter(
            sale__location_id__in=location_ids,
            sale__timestamp__gte=start_dt,
            sale__timestamp__lte=end_dt,
            menu_item__isnull=False,
        )
        .values(category=F("menu_item__category"))
        .annotate(
            revenue=Sum("line_total"),
            quantity=Sum("quantity"),
        )
        .order_by("-revenue")
    )
    return [
        {
            "category": row["category"],
            "revenue": float(row["revenue"] or 0),
            "quantity": row["quantity"] or 0,
        }
        for row in rows
    ]


def _day_metrics_for_location_ids(location_ids, target_date):
    start_dt, end_dt = day_bounds(target_date)
    agg = Sale.objects.filter(
        location_id__in=location_ids,
        timestamp__gte=start_dt,
        timestamp__lte=end_dt,
    ).aggregate(
        total_revenue=Sum("total_amount"),
        transaction_count=Count("id"),
    )
    total_revenue = agg["total_revenue"] or Decimal("0")
    transaction_count = agg["transaction_count"] or 0
    if transaction_count:
        average_transaction = total_revenue / transaction_count
    else:
        average_transaction = Decimal("0")
    return {
        "total_revenue": float(total_revenue),
        "transaction_count": transaction_count,
        "average_transaction": float(round(average_transaction, 2)),
    }


def _waste_percentage_for_location_ids(location_ids, target_date):
    locations = list(Location.objects.filter(pk__in=location_ids))
    if not locations:
        return 0.0
    total_waste = Decimal("0")
    total_revenue = Decimal("0")
    for location in locations:
        summary = DailySalesSummary.objects.filter(
            location=location, date=target_date
        ).first()
        if summary:
            total_waste += summary.waste_total
            total_revenue += summary.total_revenue
        else:
            start_dt, end_dt = day_bounds(target_date)
            waste = WasteEntry.objects.filter(
                location=location,
                logged_at__gte=start_dt,
                logged_at__lte=end_dt,
            ).aggregate(total=Sum("cost_value"))["total"] or Decimal("0")
            total_waste += waste
            total_revenue += Decimal(
                str(_day_metrics(location, target_date)["total_revenue"])
            )
    if total_revenue > 0:
        return round(float(total_waste / total_revenue * 100), 2)
    return 0.0


def build_dashboard_aggregated(locations, target_date):
    location_ids = [loc.pk for loc in locations]
    if not location_ids:
        return {
            "date": target_date.isoformat(),
            "today": {
                "total_revenue": 0,
                "transaction_count": 0,
                "average_transaction": 0,
                "waste_percentage": 0,
                "vs_last_week": {
                    "revenue_change_pct": 0,
                    "transaction_change_pct": 0,
                },
                "vs_last_year": {"revenue_change_pct": 0},
            },
            "hourly_breakdown": [],
            "top_items": [],
            "category_breakdown": [],
            "slow_movers": [],
            "aggregated": True,
        }

    today_metrics = _day_metrics_for_location_ids(location_ids, target_date)
    last_week_date = target_date - timedelta(days=7)
    try:
        last_year_date = target_date.replace(year=target_date.year - 1)
    except ValueError:
        last_year_date = target_date.replace(year=target_date.year - 1, day=28)
    last_week = _day_metrics_for_location_ids(location_ids, last_week_date)
    last_year = _day_metrics_for_location_ids(location_ids, last_year_date)

    today_metrics["vs_last_week"] = {
        "revenue_change_pct": pct_change(
            today_metrics["total_revenue"], last_week["total_revenue"]
        ),
        "transaction_change_pct": pct_change(
            today_metrics["transaction_count"], last_week["transaction_count"]
        ),
    }
    today_metrics["vs_last_year"] = {
        "revenue_change_pct": pct_change(
            today_metrics["total_revenue"], last_year["total_revenue"]
        ),
    }
    today_metrics["waste_percentage"] = _waste_percentage_for_location_ids(
        location_ids, target_date
    )

    return {
        "date": target_date.isoformat(),
        "today": today_metrics,
        "hourly_breakdown": _hourly_breakdown_for_location_ids(
            location_ids, target_date
        ),
        "top_items": _top_items_for_location_ids(location_ids, target_date),
        "category_breakdown": _category_breakdown_for_location_ids(
            location_ids, target_date
        ),
        "slow_movers": _slow_movers_for_location_ids(location_ids, target_date),
        "aggregated": True,
    }


def build_dashboard(location, target_date):
    summary = DailySalesSummary.objects.filter(
        location=location, date=target_date
    ).first()

    today_metrics = _day_metrics(location, target_date)

    last_week_date = target_date - timedelta(days=7)
    try:
        last_year_date = target_date.replace(year=target_date.year - 1)
    except ValueError:
        last_year_date = target_date.replace(year=target_date.year - 1, day=28)
    last_week = _day_metrics(location, last_week_date)
    last_year = _day_metrics(location, last_year_date)

    today_metrics["vs_last_week"] = {
        "revenue_change_pct": pct_change(
            today_metrics["total_revenue"], last_week["total_revenue"]
        ),
        "transaction_change_pct": pct_change(
            today_metrics["transaction_count"], last_week["transaction_count"]
        ),
    }
    today_metrics["vs_last_year"] = {
        "revenue_change_pct": pct_change(
            today_metrics["total_revenue"], last_year["total_revenue"]
        ),
    }
    today_metrics["waste_percentage"] = _waste_percentage(location, target_date)

    if summary and summary.transaction_count > 0:
        hourly = _hourly_breakdown_from_summary(summary)
        top_items = _top_items_from_summary(summary)
        category_breakdown = _category_breakdown_from_summary(summary)
    else:
        hourly = _hourly_breakdown_from_sales(location, target_date)
        top_items = _top_items_from_sales(location, target_date)
        category_breakdown = _category_breakdown_from_sales(location, target_date)

    return {
        "date": target_date.isoformat(),
        "today": today_metrics,
        "hourly_breakdown": hourly,
        "top_items": top_items,
        "category_breakdown": category_breakdown,
        "slow_movers": _slow_movers(location, target_date),
    }


def resolve_trends_period(request):
    period = (request.query_params.get("period") or "7d").lower()
    mapping = {"7d": 7, "30d": 30, "90d": 90}
    return mapping.get(period, 7)


def build_trends(location, days):
    return build_trends_for_locations([location.pk], days)


def build_trends_for_locations(location_ids, days):
    end_date = timezone.localdate()
    start_date = end_date - timedelta(days=days - 1)
    start_dt, _ = day_bounds(start_date)
    _, end_dt = day_bounds(end_date)

    if not location_ids:
        return {"period": f"{days}d", "days": days, "data": []}

    daily = (
        Sale.objects.filter(
            location_id__in=location_ids,
            timestamp__gte=start_dt,
            timestamp__lte=end_dt,
        )
        .annotate(day=TruncDate("timestamp"))
        .values("day")
        .annotate(
            revenue=Sum("total_amount"),
            transactions=Count("id"),
        )
        .order_by("day")
    )
    by_day = {row["day"]: row for row in daily}

    data = []
    current = start_date
    while current <= end_date:
        row = by_day.get(current)
        data.append(
            {
                "date": current.isoformat(),
                "revenue": float(row["revenue"] or 0) if row else 0.0,
                "transactions": row["transactions"] if row else 0,
            }
        )
        current += timedelta(days=1)

    return {"period": f"{days}d", "days": days, "data": data}


def build_product_performance(location, date_from, date_to, category=None):
    return build_product_performance_for_locations(
        [location.pk], date_from, date_to, category=category
    )


def build_product_performance_for_locations(
    location_ids, date_from, date_to, category=None
):
    start_dt, _ = day_bounds(date_from)
    _, end_dt = day_bounds(date_to)

    qs = SaleItem.objects.filter(
        sale__location_id__in=location_ids,
        sale__timestamp__gte=start_dt,
        sale__timestamp__lte=end_dt,
        menu_item__isnull=False,
    )
    if category:
        qs = qs.filter(menu_item__category=category)

    rows = (
        qs.values(
            "menu_item_id",
            "menu_item__name",
            "menu_item__category",
        )
        .annotate(
            quantity=Sum("quantity"),
            revenue=Sum("line_total"),
        )
        .order_by("-revenue", "-quantity")
    )

    items = [
        {
            "item_id": str(row["menu_item_id"]),
            "name": row["menu_item__name"],
            "category": row["menu_item__category"],
            "quantity": row["quantity"] or 0,
            "revenue": float(row["revenue"] or 0),
        }
        for row in rows
    ]

    return {
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "category": category,
        "items": items,
    }


def build_org_sales_comparison(organisation, start_dt, end_dt):
    from core.models import Location

    locations = Location.objects.filter(organisation=organisation, is_active=True)
    results = []
    for location in locations:
        agg = Sale.objects.filter(
            location=location,
            timestamp__gte=start_dt,
            timestamp__lte=end_dt,
        ).aggregate(
            total_revenue=Sum("total_amount"),
            transaction_count=Count("id"),
        )
        total_revenue = float(agg["total_revenue"] or 0)
        transaction_count = agg["transaction_count"] or 0
        avg = total_revenue / transaction_count if transaction_count else 0.0
        start_date = start_dt.date()
        end_date = end_dt.date()
        results.append(
            {
                "location_id": str(location.id),
                "location_name": location.name,
                "total_revenue": total_revenue,
                "transaction_count": transaction_count,
                "average_transaction": round(avg, 2),
                "waste_percentage": _waste_percentage_for_range(
                    location, start_date, end_date
                ),
            }
        )
    results.sort(key=lambda r: r["total_revenue"], reverse=True)
    return {
        "period_start": start_dt.isoformat(),
        "period_end": end_dt.isoformat(),
        "locations": results,
    }


def compute_daily_summary(location, target_date):
    """
    Aggregate Sale/SaleItem/WasteEntry into a DailySalesSummary.
    Idempotent via update_or_create.
    """
    metrics = _day_metrics(location, target_date)
    hourly_list = _hourly_breakdown_from_sales(location, target_date)
    hourly_dict = {
        f"{row['hour']:02d}": {
            "revenue": row["revenue"],
            "transactions": row["transactions"],
        }
        for row in hourly_list
    }

    top_items = _top_items_from_sales(location, target_date, limit=20)
    top_items_stored = [
        {
            "item_id": item["item_id"],
            "name": item["name"],
            "quantity": item["quantity"],
            "revenue": item["revenue"],
        }
        for item in top_items
    ]

    category_list = _category_breakdown_from_sales(location, target_date)
    category_dict = {
        row["category"]: {
            "revenue": row["revenue"],
            "quantity": row["quantity"],
        }
        for row in category_list
    }

    start_dt, end_dt = day_bounds(target_date)
    waste_agg = WasteEntry.objects.filter(
        location=location,
        logged_at__gte=start_dt,
        logged_at__lte=end_dt,
    ).aggregate(waste_total=Sum("cost_value"))
    waste_total = waste_agg["waste_total"] or Decimal("0")
    total_revenue = Decimal(str(metrics["total_revenue"]))
    waste_percentage = 0.0
    if total_revenue > 0:
        waste_percentage = round(float(waste_total / total_revenue * 100), 2)

    summary, _created = DailySalesSummary.objects.update_or_create(
        location=location,
        date=target_date,
        defaults={
            "total_revenue": total_revenue,
            "transaction_count": metrics["transaction_count"],
            "average_transaction": Decimal(str(metrics["average_transaction"])),
            "top_items": top_items_stored,
            "hourly_breakdown": hourly_dict,
            "category_breakdown": category_dict,
            "waste_total": waste_total,
            "waste_percentage": waste_percentage,
        },
    )
    return summary
