"""Seed realistic date check rounds, entries, and expiry alerts."""

from django.core.management.base import BaseCommand

from core.models import Organisation
from datechecks.seed_helpers import clear_datechecks_for_org, seed_datechecks


class Command(BaseCommand):
    help = "Seed date check schedules, historical rounds, and expiry alerts for ACFE Coffee"

    def add_arguments(self, parser):
        parser.add_argument(
            "--org",
            default="acfe-coffee",
            help="Organisation slug (default: acfe-coffee)",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Delete existing date check data for this organisation before seeding",
        )
        parser.add_argument(
            "--checks",
            type=int,
            default=10,
            help="Number of completed date check rounds to create (default: 10)",
        )

    def handle(self, *args, **options):
        try:
            org = Organisation.objects.get(slug=options["org"])
        except Organisation.DoesNotExist:
            self.stderr.write(
                self.style.ERROR(f"Organisation '{options['org']}' not found.")
            )
            return

        if options["force"]:
            clear_datechecks_for_org(org)
            self.stdout.write(
                self.style.WARNING(f"Cleared existing date check data for {org.name}.")
            )

        stats = seed_datechecks(org, num_checks=options["checks"])

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Created {stats['date_checks']} date checks, "
                f"{stats['entries']} entries, "
                f"{stats['active_alerts']} active alerts"
            )
        )
        if stats.get("resolved_alerts"):
            self.stdout.write(
                f"  Resolved {stats['resolved_alerts']} alerts "
                f"(including waste entries where applicable)."
            )
        self.stdout.write(f"  Schedules configured: {stats.get('schedules', 0)}")
