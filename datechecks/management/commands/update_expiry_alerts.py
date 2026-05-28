from django.core.management.base import BaseCommand

from datechecks.api.services import run_expiry_alert_maintenance


class Command(BaseCommand):
    help = (
        "Re-evaluate pending expiry alerts, auto-dismiss zero-stock alerts, "
        "and send overdue date-check reminders (idempotent; safe for cron/beat)."
    )

    def handle(self, *args, **options):
        stats = run_expiry_alert_maintenance()
        self.stdout.write(
            self.style.SUCCESS(
                f"Updated {stats['total_updated']} alerts "
                f"({stats['upgraded']} upgraded, {stats['auto_dismissed']} auto-dismissed). "
                f"{stats['reminders_sent']} overdue reminders sent."
            )
        )
