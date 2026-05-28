"""
One-shot demo setup for production (e.g. Railway).

Runs migrations are expected separately. This command:
  - Ensures the Django admin superuser exists
  - Seeds ACFE Coffee demo data if not present (seed_data)
  - Seeds training programmes if not present (seed_training)

Set SEED_DEMO_DATA=false to skip seeding (superuser still created).
"""

import os

from django.core.management import call_command
from django.core.management.base import BaseCommand

from core.management.superuser import ensure_dev_superuser
from core.models import Organisation
from training.models import TrainingProgramme


class Command(BaseCommand):
    help = "Ensure superuser and demo seed data exist (idempotent, safe on redeploy)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force-seed",
            action="store_true",
            help="Re-run seed_data and seed_training with --force (wipes demo org data)",
        )

    def handle(self, *args, **options):
        user, created = ensure_dev_superuser()
        self.stdout.write(
            self.style.SUCCESS(
                f"{'Created' if created else 'Updated'} superuser: {user.username}"
            )
        )

        if os.environ.get("SEED_DEMO_DATA", "true").lower() in ("false", "0", "no"):
            self.stdout.write("SEED_DEMO_DATA is disabled — skipping demo seeds.")
            return

        force = options["force_seed"]
        org_exists = Organisation.objects.filter(slug="acfe-coffee").exists()

        if not org_exists or force:
            self.stdout.write("Running seed_data…")
            call_command("seed_data", force=force)
        else:
            self.stdout.write("Demo organisation already exists — skipping seed_data.")

        training_exists = TrainingProgramme.objects.filter(
            organisation__slug="acfe-coffee"
        ).exists()
        if not training_exists or force:
            self.stdout.write("Running seed_training…")
            call_command("seed_training", force=force)
        else:
            self.stdout.write("Training data already exists — skipping seed_training.")

        self.stdout.write(self.style.SUCCESS("Bootstrap complete."))
