from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from core.models import Location, Organisation, User
from datechecks.api.services import (
    OVERDUE_MEMO_TITLE,
    run_expiry_alert_maintenance,
)
from datechecks.models import (
    DateCheck,
    DateCheckEntry,
    DateCheckSchedule,
    ExpiryAlert,
)
from inventory.models import LocationStock, StockItem
from memos.models import Memo


class UpdateExpiryAlertsCommandTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Test Org", slug="test-org")
        self.location = Location.objects.create(
            organisation=self.org,
            name="Test Café",
            slug="test-cafe",
        )
        self.user = User.objects.create_user(
            username="staff1",
            password="pass",
            organisation=self.org,
        )
        self.stock_item = StockItem.objects.create(
            organisation=self.org,
            name="Milk",
        )
        self.location_stock = LocationStock.objects.create(
            stock_item=self.stock_item,
            location=self.location,
            current_quantity=5,
            unit_cost=Decimal("1.00"),
        )
        self.schedule = DateCheckSchedule.objects.create(
            location=self.location,
            reminder_enabled=True,
            last_check_at=timezone.now() - timedelta(days=3),
        )
        self.date_check = DateCheck.objects.create(
            location=self.location,
            conducted_by=self.user,
            status=DateCheck.Status.COMPLETED,
        )

    def _create_pending_alert(
        self,
        *,
        expiry_date,
        alert_level,
        quantity=5,
        stock_quantity=5,
    ):
        entry = DateCheckEntry.objects.create(
            date_check=self.date_check,
            stock_item=self.stock_item,
            product_name="Milk",
            earliest_expiry=expiry_date,
            quantity_at_risk=quantity,
            expiry_status=DateCheckEntry.ExpiryStatus.WARNING,
        )
        self.location_stock.current_quantity = stock_quantity
        self.location_stock.save(update_fields=["current_quantity"])
        return ExpiryAlert.objects.create(
            location=self.location,
            date_check_entry=entry,
            product_name="Milk",
            expiry_date=expiry_date,
            quantity_at_risk=quantity,
            alert_level=alert_level,
            resolution=ExpiryAlert.Resolution.PENDING,
        )

    def test_upgrades_warning_to_critical_when_expires_today(self):
        today = date.today()
        alert = self._create_pending_alert(
            expiry_date=today,
            alert_level=ExpiryAlert.AlertLevel.WARNING,
        )

        stats = run_expiry_alert_maintenance()

        alert.refresh_from_db()
        self.assertEqual(alert.alert_level, ExpiryAlert.AlertLevel.CRITICAL)
        self.assertEqual(stats["upgraded"], 1)
        self.assertEqual(stats["total_updated"], 1)

    def test_upgrades_critical_to_expired_when_past_date(self):
        yesterday = date.today() - timedelta(days=1)
        alert = self._create_pending_alert(
            expiry_date=yesterday,
            alert_level=ExpiryAlert.AlertLevel.CRITICAL,
        )

        run_expiry_alert_maintenance()

        alert.refresh_from_db()
        self.assertEqual(alert.alert_level, ExpiryAlert.AlertLevel.EXPIRED)

    def test_auto_dismisses_zero_stock(self):
        alert = self._create_pending_alert(
            expiry_date=date.today() + timedelta(days=5),
            alert_level=ExpiryAlert.AlertLevel.WARNING,
            stock_quantity=0,
        )

        stats = run_expiry_alert_maintenance()

        alert.refresh_from_db()
        self.assertEqual(alert.resolution, ExpiryAlert.Resolution.DISMISSED)
        self.assertEqual(stats["auto_dismissed"], 1)

    def test_creates_overdue_memo_once_per_day(self):
        stats_first = run_expiry_alert_maintenance()
        stats_second = run_expiry_alert_maintenance()

        self.assertEqual(stats_first["reminders_sent"], 1)
        self.assertEqual(stats_second["reminders_sent"], 0)
        self.assertEqual(
            Memo.objects.filter(
                location=self.location,
                title=OVERDUE_MEMO_TITLE,
            ).count(),
            1,
        )
        memo = Memo.objects.get(location=self.location, title=OVERDUE_MEMO_TITLE)
        self.assertEqual(memo.priority, Memo.Priority.IMPORTANT)
        self.assertEqual(memo.category, Memo.Category.HEALTH_SAFETY)
        self.assertTrue(memo.requires_acknowledgement)
        self.assertIn("No date check has been recorded since", memo.body)
