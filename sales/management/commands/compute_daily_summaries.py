from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import Location
from sales.api.analytics import compute_daily_summary, parse_date


class Command(BaseCommand):
    help = (
        "Aggregate Sale/SaleItem/WasteEntry data into DailySalesSummary "
        "for a date range (idempotent)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--date-from",
            dest="date_from",
            help="Start date (YYYY-MM-DD). Defaults to yesterday.",
        )
        parser.add_argument(
            "--date-to",
            dest="date_to",
            help="End date (YYYY-MM-DD). Defaults to date-from.",
        )
        parser.add_argument(
            "--location",
            dest="location_id",
            help="Limit to a single location UUID.",
        )
        parser.add_argument(
            "--organisation",
            dest="organisation_slug",
            help="Limit to locations in this organisation slug.",
        )

    def handle(self, *args, **options):
        today = timezone.localdate()
        date_from = parse_date(options.get("date_from"), default=today - timedelta(days=1))
        date_to = parse_date(options.get("date_to"), default=date_from)

        if date_from > date_to:
            date_from, date_to = date_to, date_from

        locations = Location.objects.filter(is_active=True)
        location_id = options.get("location_id")
        if location_id:
            locations = locations.filter(pk=location_id)
            if not locations.exists():
                raise CommandError(f"Location not found: {location_id}")

        org_slug = options.get("organisation_slug")
        if org_slug:
            locations = locations.filter(organisation__slug=org_slug)
            if not locations.exists():
                raise CommandError(
                    f"No active locations for organisation slug: {org_slug}"
                )

        created_or_updated = 0
        current = date_from
        while current <= date_to:
            for location in locations:
                compute_daily_summary(location, current)
                created_or_updated += 1
            current += timedelta(days=1)

        self.stdout.write(
            self.style.SUCCESS(
                f"Computed {created_or_updated} daily summar"
                f"{'y' if created_or_updated == 1 else 'ies'} "
                f"from {date_from} to {date_to} "
                f"across {locations.count()} location(s)."
            )
        )
