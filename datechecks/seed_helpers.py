"""Shared logic for seeding date check demo data."""

import random
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.models import Location, Organisation, User, UserLocationRole
from datechecks.api.services import calculate_entry_cost, create_expiry_alerts_for_check
from datechecks.models import (
    DateCheck,
    DateCheckEntry,
    DateCheckSchedule,
    ExpiryAlert,
)
from inventory.models import LocationStock, StockItem
from waste.api.services import create_waste_entry
from waste.models import WasteEntry


def clear_datechecks_for_org(organisation: Organisation) -> None:
    location_ids = Location.objects.filter(organisation=organisation).values_list(
        "pk", flat=True
    )
    ExpiryAlert.objects.filter(location_id__in=location_ids).delete()
    DateCheckEntry.objects.filter(date_check__location_id__in=location_ids).delete()
    DateCheck.objects.filter(location_id__in=location_ids).delete()
    DateCheckSchedule.objects.filter(location_id__in=location_ids).delete()


def _users_for_location(location: Location) -> list[User]:
    return list(
        User.objects.filter(
            user_location_roles__location=location,
            user_location_roles__role__slug__in=("content_manager", "staff"),
        ).distinct()
    )


def _pick_expiry_and_action(today: date) -> tuple[date, str, str]:
    """Return (earliest_expiry, expiry_status bucket, action_taken)."""
    roll = random.random()
    if roll < 0.70:
        days_out = random.randint(7, 30)
        expiry = today + timedelta(days=days_out)
        return expiry, DateCheckEntry.ExpiryStatus.OK, DateCheckEntry.Action.NONE
    if roll < 0.85:
        days_out = random.randint(2, 3)
        expiry = today + timedelta(days=days_out)
        action = random.choice(
            [DateCheckEntry.Action.USE_FIRST, DateCheckEntry.Action.NONE]
        )
        return expiry, DateCheckEntry.ExpiryStatus.WARNING, action
    if roll < 0.95:
        days_out = random.randint(0, 1)
        expiry = today + timedelta(days=days_out)
        return expiry, DateCheckEntry.ExpiryStatus.CRITICAL, DateCheckEntry.Action.USE_FIRST
    days_ago = random.randint(1, 5)
    expiry = today - timedelta(days=days_ago)
    return expiry, DateCheckEntry.ExpiryStatus.EXPIRED, DateCheckEntry.Action.DISPOSE


def _create_check_entries(
    date_check: DateCheck,
    stock_items: list[StockItem],
    *,
    as_of: date,
    threshold_days: int,
) -> list[DateCheckEntry]:
    location = date_check.location
    count = random.randint(15, 25)
    chosen = random.sample(stock_items, min(count, len(stock_items)))
    if len(chosen) < count:
        chosen = chosen + random.choices(stock_items, k=count - len(chosen))

    entries = []
    for stock_item in chosen:
        expiry, _bucket, action = _pick_expiry_and_action(as_of)
        qty = random.choice([1, 1, 2, 3, 4, 6, 8, 12, 1.5, 2.5])
        unit = stock_item.unit
        cost = calculate_entry_cost(
            location=location,
            stock_item=stock_item,
            quantity=qty,
        )
        entry = DateCheckEntry(
            date_check=date_check,
            stock_item=stock_item,
            product_name=stock_item.name,
            earliest_expiry=expiry,
            quantity_at_risk=qty,
            unit=unit,
            estimated_cost=cost,
            action_taken=action,
        )
        entry.expiry_status = entry.compute_status(threshold_days=threshold_days)
        entries.append(entry)

    return DateCheckEntry.objects.bulk_create(entries)


def _finalize_check(
    date_check: DateCheck,
    *,
    started_at: datetime,
    completed_at: datetime,
    threshold_days: int,
) -> DateCheck:
    date_check.status = DateCheck.Status.COMPLETED
    date_check.complete(threshold_days=threshold_days)
    DateCheck.objects.filter(pk=date_check.pk).update(
        started_at=started_at,
        completed_at=completed_at,
    )
    date_check.refresh_from_db()
    return date_check


@transaction.atomic
def seed_datechecks(
    organisation: Organisation,
    *,
    num_checks: int = 10,
    days_span: int = 14,
) -> dict[str, int]:
    """
    Seed schedules, historical date checks, and alerts for an organisation.
    Returns counts: date_checks, entries, active_alerts, resolved_alerts.
    """
    locations = list(
        Location.objects.filter(organisation=organisation, is_active=True).order_by(
            "name"
        )
    )
    if not locations:
        return {"date_checks": 0, "entries": 0, "active_alerts": 0}

    stock_items = list(
        StockItem.objects.filter(organisation=organisation, is_active=True)
    )
    if not stock_items:
        return {"date_checks": 0, "entries": 0, "active_alerts": 0}

    threshold_days = 3
    schedules = []
    for location in locations:
        schedule, _ = DateCheckSchedule.objects.update_or_create(
            location=location,
            defaults={
                "frequency": DateCheckSchedule.Frequency.DAILY,
                "alert_threshold_days": threshold_days,
                "reminder_enabled": True,
                "reminder_time": time(9, 0),
            },
        )
        schedules.append(schedule)

    now = timezone.now()
    today = timezone.localdate()

    # Spread checks over the last `days_span` days (roughly daily, both locations)
    day_pool = list(range(days_span))
    random.shuffle(day_pool)
    day_offsets = []
    for i in range(num_checks):
        day_offsets.append(day_pool[i % len(day_pool)])
    day_offsets.sort(reverse=True)

    check_slots: list[tuple[Location, int]] = []
    for i in range(num_checks):
        location = locations[i % len(locations)]
        check_slots.append((location, day_offsets[i]))

    created_checks: list[DateCheck] = []
    total_entries = 0

    for location, days_ago in check_slots:
        users = _users_for_location(location)
        conductor = random.choice(users) if users else None

        check_date = today - timedelta(days=days_ago)
        hour = random.randint(8, 16)
        minute = random.choice([0, 15, 30, 45])
        started_at = timezone.make_aware(
            datetime.combine(check_date, time(hour, minute)),
            timezone.get_current_timezone(),
        )
        duration_mins = random.randint(12, 45)
        completed_at = started_at + timedelta(minutes=duration_mins)

        date_check = DateCheck.objects.create(
            location=location,
            conducted_by=conductor,
            status=DateCheck.Status.IN_PROGRESS,
            notes=random.choice(
                [
                    "",
                    "Walk-in fridge and dry store checked.",
                    "Skipped freezer — locked for maintenance.",
                    "Morning check before delivery.",
                    "Extra pass on dairy after weekend.",
                ]
            ),
        )
        entries = _create_check_entries(
            date_check,
            stock_items,
            as_of=check_date,
            threshold_days=threshold_days,
        )
        total_entries += len(entries)
        _finalize_check(
            date_check,
            started_at=started_at,
            completed_at=completed_at,
            threshold_days=threshold_days,
        )
        created_checks.append(date_check)

    # Alerts only for the most recent check
    most_recent = max(created_checks, key=lambda c: c.started_at)
    create_expiry_alerts_for_check(most_recent)

    pending_alerts = list(
        ExpiryAlert.objects.filter(
            location=most_recent.location,
            resolution=ExpiryAlert.Resolution.PENDING,
            date_check_entry__date_check=most_recent,
        ).select_related("date_check_entry", "date_check_entry__stock_item")
    )

    resolved_count = 0
    if pending_alerts:
        resolver = _users_for_location(most_recent.location)
        resolved_by = random.choice(resolver) if resolver else None
        to_resolve = random.sample(
            pending_alerts,
            min(3, len(pending_alerts)),
        )

        resolution_plan = [
            (ExpiryAlert.Resolution.USED, "Used in today's prep"),
            (ExpiryAlert.Resolution.DISPOSED, "Disposed during check"),
            (ExpiryAlert.Resolution.DISMISSED, "Label misread — still good"),
        ]

        wasted_targets = [
            a
            for a in pending_alerts
            if a.alert_level == ExpiryAlert.AlertLevel.EXPIRED
            and a.date_check_entry.stock_item_id
        ][:2]

        for alert in to_resolve:
            if alert in wasted_targets:
                entry = alert.date_check_entry
                waste_entry = create_waste_entry(
                    location=alert.location,
                    item_type=WasteEntry.ItemType.STOCK_ITEM,
                    stock_item=entry.stock_item,
                    quantity=alert.quantity_at_risk,
                    unit=entry.unit,
                    reason=WasteEntry.Reason.EXPIRED,
                    reason_note="Seeded expired stock from date check",
                    shift=WasteEntry.Shift.MORNING,
                    logged_by=resolved_by,
                )
                alert.resolution = ExpiryAlert.Resolution.WASTED
                alert.waste_entry = waste_entry
            else:
                resolution, note = random.choice(resolution_plan)
                alert.resolution = resolution
                alert.resolved_note = note

            alert.resolved_by = resolved_by
            alert.resolved_at = most_recent.completed_at + timedelta(hours=1)
            alert.save(
                update_fields=[
                    "resolution",
                    "resolved_note",
                    "resolved_by",
                    "resolved_at",
                    "waste_entry",
                ]
            )
            resolved_count += 1

    # Update schedule last_check_at from newest check per location
    for location in locations:
        latest = (
            DateCheck.objects.filter(
                location=location,
                status=DateCheck.Status.COMPLETED,
            )
            .order_by("-completed_at")
            .first()
        )
        if latest and latest.completed_at:
            DateCheckSchedule.objects.filter(location=location).update(
                last_check_at=latest.completed_at
            )

    active_alerts = ExpiryAlert.objects.filter(
        location__organisation=organisation,
        resolution=ExpiryAlert.Resolution.PENDING,
    ).count()

    return {
        "date_checks": len(created_checks),
        "entries": total_entries,
        "active_alerts": active_alerts,
        "resolved_alerts": resolved_count,
        "schedules": len(schedules),
    }
