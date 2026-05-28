"""Date check business logic."""

from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from datechecks.models import (
    DateCheck,
    DateCheckEntry,
    DateCheckSchedule,
    ExpiryAlert,
)
from inventory.models import LocationStock
from sales.models import MenuItem
from waste.api.services import create_waste_entry
from waste.models import WasteEntry


ENTRY_ALERT_STATUSES = frozenset(
    {
        DateCheckEntry.ExpiryStatus.WARNING,
        DateCheckEntry.ExpiryStatus.CRITICAL,
        DateCheckEntry.ExpiryStatus.EXPIRED,
    }
)

STATUS_TO_ALERT_LEVEL = {
    DateCheckEntry.ExpiryStatus.WARNING: ExpiryAlert.AlertLevel.WARNING,
    DateCheckEntry.ExpiryStatus.CRITICAL: ExpiryAlert.AlertLevel.CRITICAL,
    DateCheckEntry.ExpiryStatus.EXPIRED: ExpiryAlert.AlertLevel.EXPIRED,
}

ALERT_LEVEL_SEVERITY = {
    ExpiryAlert.AlertLevel.WARNING: 1,
    ExpiryAlert.AlertLevel.CRITICAL: 2,
    ExpiryAlert.AlertLevel.EXPIRED: 3,
}

OVERDUE_MEMO_TITLE = "Date check overdue"
AUTO_DISMISS_NOTE = "Auto-dismissed: product stock is zero."


def get_or_create_schedule(location):
    schedule, _ = DateCheckSchedule.objects.get_or_create(location=location)
    return schedule


def calculate_entry_cost(*, location, stock_item=None, menu_item=None, quantity):
    qty = Decimal(str(quantity))
    if stock_item is not None:
        location_stock = LocationStock.objects.filter(
            stock_item=stock_item, location=location
        ).first()
        unit_cost = location_stock.unit_cost if location_stock else Decimal("0")
        return (unit_cost * qty).quantize(Decimal("0.01"))
    if menu_item is not None:
        return (menu_item.ingredient_cost * qty).quantize(Decimal("0.01"))
    return Decimal("0")


def infer_shift():
    hour = timezone.localtime().hour
    if hour < 12:
        return WasteEntry.Shift.MORNING
    if hour < 17:
        return WasteEntry.Shift.AFTERNOON
    return WasteEntry.Shift.EVENING


@transaction.atomic
def create_date_check_entry(
    *,
    date_check,
    stock_item=None,
    menu_item=None,
    product_name="",
    earliest_expiry,
    quantity_at_risk=1,
    unit="units",
    photo=None,
    action_taken=DateCheckEntry.Action.NONE,
    action_note="",
):
    if date_check.status != DateCheck.Status.IN_PROGRESS:
        raise ValueError("Cannot add entries to a completed date check.")

    schedule = get_or_create_schedule(date_check.location)
    threshold = schedule.alert_threshold_days

    if not product_name:
        if stock_item is not None:
            product_name = stock_item.name
            if not unit or unit == "units":
                unit = stock_item.unit
        elif menu_item is not None:
            product_name = menu_item.name

    if not product_name:
        raise ValueError("product_name is required when no stock or menu item is given.")

    estimated_cost = calculate_entry_cost(
        location=date_check.location,
        stock_item=stock_item,
        menu_item=menu_item,
        quantity=quantity_at_risk,
    )

    entry = DateCheckEntry(
        date_check=date_check,
        stock_item=stock_item,
        menu_item=menu_item,
        product_name=product_name,
        earliest_expiry=earliest_expiry,
        quantity_at_risk=quantity_at_risk,
        unit=unit,
        estimated_cost=estimated_cost,
        action_taken=action_taken,
        action_note=action_note,
        photo=photo,
    )
    entry.expiry_status = entry.compute_status(threshold_days=threshold)
    entry.save()
    return entry


def create_expiry_alerts_for_check(date_check):
    created = []
    for entry in date_check.entries.filter(expiry_status__in=ENTRY_ALERT_STATUSES):
        alert_level = STATUS_TO_ALERT_LEVEL[entry.expiry_status]
        alert, was_created = ExpiryAlert.objects.get_or_create(
            date_check_entry=entry,
            defaults={
                "location": date_check.location,
                "product_name": entry.product_name,
                "expiry_date": entry.earliest_expiry,
                "quantity_at_risk": entry.quantity_at_risk,
                "estimated_cost": entry.estimated_cost,
                "alert_level": alert_level,
            },
        )
        if was_created:
            created.append(alert)
        elif alert.resolution == ExpiryAlert.Resolution.PENDING:
            alert.alert_level = alert_level
            alert.product_name = entry.product_name
            alert.expiry_date = entry.earliest_expiry
            alert.quantity_at_risk = entry.quantity_at_risk
            alert.estimated_cost = entry.estimated_cost
            alert.save(
                update_fields=[
                    "alert_level",
                    "product_name",
                    "expiry_date",
                    "quantity_at_risk",
                    "estimated_cost",
                ]
            )
    return created


@transaction.atomic
def complete_date_check(date_check):
    if date_check.status != DateCheck.Status.IN_PROGRESS:
        raise ValueError("Date check is not in progress.")

    schedule = get_or_create_schedule(date_check.location)
    threshold = schedule.alert_threshold_days

    for entry in date_check.entries.all():
        entry.expiry_status = entry.compute_status(threshold_days=threshold)
        entry.save(update_fields=["expiry_status"])

    date_check.complete(threshold_days=threshold)
    alerts = create_expiry_alerts_for_check(date_check)

    schedule.last_check_at = timezone.now()
    schedule.save(update_fields=["last_check_at", "updated_at"])

    return date_check, alerts


@transaction.atomic
def resolve_expiry_alert(*, alert, resolution, resolved_note="", resolved_by=None):
    if alert.resolution != ExpiryAlert.Resolution.PENDING:
        raise ValueError("Alert is already resolved.")

    waste_entry = None
    if resolution == ExpiryAlert.Resolution.WASTED:
        entry = alert.date_check_entry
        auto_note = f"Auto-logged from expiry alert #{alert.id}"
        if resolved_note:
            auto_note = f"{auto_note}. {resolved_note}"
        waste_kwargs = {
            "location": alert.location,
            "quantity": alert.quantity_at_risk,
            "unit": entry.unit,
            "reason": WasteEntry.Reason.EXPIRED,
            "reason_note": auto_note,
            "shift": infer_shift(),
            "logged_by": resolved_by,
            "cost_value": alert.estimated_cost,
        }
        if entry.stock_item_id:
            waste_entry = create_waste_entry(
                item_type=WasteEntry.ItemType.STOCK_ITEM,
                stock_item=entry.stock_item,
                **waste_kwargs,
            )
        elif entry.menu_item_id:
            waste_entry = create_waste_entry(
                item_type=WasteEntry.ItemType.MENU_ITEM,
                menu_item=entry.menu_item,
                **waste_kwargs,
            )
        else:
            raise ValueError(
                "Cannot log waste for an alert without a linked stock or menu item."
            )

    alert.resolution = resolution
    alert.resolved_note = resolved_note
    alert.resolved_by = resolved_by
    alert.resolved_at = timezone.now()
    alert.waste_entry = waste_entry
    alert.save(
        update_fields=[
            "resolution",
            "resolved_note",
            "resolved_by",
            "resolved_at",
            "waste_entry",
        ]
    )
    return alert


def frequency_interval_days(frequency):
    return {
        DateCheckSchedule.Frequency.DAILY: 1,
        DateCheckSchedule.Frequency.EVERY_OTHER_DAY: 2,
        DateCheckSchedule.Frequency.TWICE_WEEKLY: 4,
        DateCheckSchedule.Frequency.WEEKLY: 7,
    }.get(frequency, 1)


def compute_next_check_due(schedule):
    if schedule.last_check_at is None:
        return None
    days = frequency_interval_days(schedule.frequency)
    return schedule.last_check_at + timedelta(days=days)


def build_schedule_status(schedule):
    now = timezone.now()
    hours_since = None
    if schedule.last_check_at:
        hours_since = round((now - schedule.last_check_at).total_seconds() / 3600, 1)

    next_due = compute_next_check_due(schedule)
    return {
        "frequency": schedule.frequency,
        "last_check_at": schedule.last_check_at,
        "is_overdue": schedule.is_overdue,
        "hours_since_last_check": hours_since,
        "next_check_due": next_due,
    }


def compute_alert_level_from_expiry(*, expiry_date, threshold_days):
    """Derive alert level from expiry date (mirrors DateCheckEntry.compute_status)."""
    today = date.today()
    if expiry_date < today:
        return ExpiryAlert.AlertLevel.EXPIRED
    if expiry_date <= today + timedelta(days=1):
        return ExpiryAlert.AlertLevel.CRITICAL
    if expiry_date <= today + timedelta(days=threshold_days):
        return ExpiryAlert.AlertLevel.WARNING
    return None


def format_last_check_for_memo(last_check_at):
    if last_check_at is None:
        return None
    return timezone.localtime(last_check_at).strftime("%d %b %Y at %H:%M")


def build_overdue_memo_body(schedule):
    formatted = format_last_check_for_memo(schedule.last_check_at)
    if formatted:
        return (
            f"No date check has been recorded since {formatted}. "
            "Please complete a date check as soon as possible."
        )
    return (
        "No date check has been recorded yet. "
        "Please complete a date check as soon as possible."
    )


def overdue_reminder_already_sent_today(*, location_id, on_date=None):
    from memos.models import Memo

    on_date = on_date or timezone.localdate()
    return Memo.objects.filter(
        location_id=location_id,
        title=OVERDUE_MEMO_TITLE,
        deleted_at__isnull=True,
        created_at__date=on_date,
    ).exists()


@transaction.atomic
def run_expiry_alert_maintenance():
    """
    Daily maintenance: upgrade pending alert levels, auto-dismiss zero-stock alerts,
    and send overdue date-check memos. Safe to run multiple times per day.
    """
    from memos.models import Memo

    schedules_by_location = {
        schedule.location_id: schedule
        for schedule in DateCheckSchedule.objects.select_related(
            "location", "location__organisation"
        )
    }
    default_threshold = 3

    pending_alerts = list(
        ExpiryAlert.objects.filter(resolution=ExpiryAlert.Resolution.PENDING)
        .select_related("date_check_entry", "location")
        .iterator()
    )

    stock_item_ids = {
        alert.date_check_entry.stock_item_id
        for alert in pending_alerts
        if alert.date_check_entry.stock_item_id
    }
    location_ids = {alert.location_id for alert in pending_alerts}
    stock_by_key = {
        (ls.location_id, ls.stock_item_id): ls
        for ls in LocationStock.objects.filter(
            stock_item_id__in=stock_item_ids,
            location_id__in=location_ids,
        )
    }

    upgraded = 0
    auto_dismissed = 0
    now = timezone.now()
    alerts_to_upgrade = []
    alerts_to_dismiss = []

    for alert in pending_alerts:
        entry = alert.date_check_entry
        if entry.stock_item_id:
            location_stock = stock_by_key.get((alert.location_id, entry.stock_item_id))
            if location_stock is None or location_stock.current_quantity <= 0:
                alert.resolution = ExpiryAlert.Resolution.DISMISSED
                alert.resolved_at = now
                alert.resolved_note = AUTO_DISMISS_NOTE
                alerts_to_dismiss.append(alert)
                continue

        schedule = schedules_by_location.get(alert.location_id)
        threshold = (
            schedule.alert_threshold_days if schedule else default_threshold
        )
        target_level = compute_alert_level_from_expiry(
            expiry_date=alert.expiry_date,
            threshold_days=threshold,
        )
        if target_level is None:
            continue
        current_severity = ALERT_LEVEL_SEVERITY.get(alert.alert_level, 0)
        target_severity = ALERT_LEVEL_SEVERITY[target_level]
        if target_severity > current_severity:
            alert.alert_level = target_level
            alerts_to_upgrade.append(alert)

    if alerts_to_upgrade:
        ExpiryAlert.objects.bulk_update(alerts_to_upgrade, ["alert_level"])
        upgraded = len(alerts_to_upgrade)

    if alerts_to_dismiss:
        ExpiryAlert.objects.bulk_update(
            alerts_to_dismiss,
            ["resolution", "resolved_at", "resolved_note"],
        )
        auto_dismissed = len(alerts_to_dismiss)

    reminders_sent = 0
    today = timezone.localdate()
    for schedule in schedules_by_location.values():
        if not schedule.reminder_enabled or not schedule.is_overdue:
            continue
        if not schedule.location.is_active:
            continue
        if overdue_reminder_already_sent_today(
            location_id=schedule.location_id, on_date=today
        ):
            continue
        Memo.objects.create(
            location=schedule.location,
            organisation=schedule.location.organisation,
            author=None,
            title=OVERDUE_MEMO_TITLE,
            body=build_overdue_memo_body(schedule),
            priority=Memo.Priority.IMPORTANT,
            category=Memo.Category.HEALTH_SAFETY,
            requires_acknowledgement=True,
        )
        reminders_sent += 1

    total_updated = upgraded + auto_dismissed
    return {
        "total_updated": total_updated,
        "upgraded": upgraded,
        "auto_dismissed": auto_dismissed,
        "reminders_sent": reminders_sent,
    }


def latest_date_check_entry_subquery(location):
    """Subquery for the most recent completed date-check entry per stock item."""
    from django.db.models import OuterRef

    return (
        DateCheckEntry.objects.filter(
            stock_item_id=OuterRef("stock_item_id"),
            date_check__location=location,
            date_check__status=DateCheck.Status.COMPLETED,
        )
        .order_by("-date_check__completed_at", "-created_at")
    )


def get_stock_item_date_check_history(*, location, stock_item, limit=5):
    entries = (
        DateCheckEntry.objects.filter(
            stock_item=stock_item,
            date_check__location=location,
            date_check__status=DateCheck.Status.COMPLETED,
        )
        .select_related("date_check")
        .order_by("-date_check__completed_at", "-created_at")[:limit]
    )
    results = []
    for entry in entries:
        check = entry.date_check
        check_date = check.completed_at or check.started_at
        results.append(
            {
                "id": entry.id,
                "check_date": check_date,
                "earliest_expiry": entry.earliest_expiry,
                "expiry_status": entry.expiry_status,
                "action_taken": entry.action_taken,
                "action_taken_display": entry.get_action_taken_display(),
            }
        )
    return results


def build_org_compliance(organisation):
    from core.models import Location

    locations = Location.objects.filter(organisation=organisation, is_active=True)
    results = []
    for location in locations.order_by("name"):
        schedule = DateCheckSchedule.objects.filter(location=location).first()
        last_check_at = schedule.last_check_at if schedule else None
        is_overdue = schedule.is_overdue if schedule else True

        pending_alerts = ExpiryAlert.objects.filter(
            location=location,
            resolution=ExpiryAlert.Resolution.PENDING,
        )
        active_alerts_count = pending_alerts.count()
        items_expired_count = pending_alerts.filter(
            alert_level=ExpiryAlert.AlertLevel.EXPIRED
        ).count()

        results.append(
            {
                "location_id": str(location.id),
                "location_name": location.name,
                "last_check_at": (
                    timezone.localtime(last_check_at).isoformat()
                    if last_check_at
                    else None
                ),
                "is_overdue": is_overdue,
                "active_alerts_count": active_alerts_count,
                "items_expired_count": items_expired_count,
            }
        )
    return results
