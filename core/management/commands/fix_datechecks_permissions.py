from django.core.management.base import BaseCommand

from core.role_permissions import ensure_datechecks_permissions_on_roles


class Command(BaseCommand):
    help = "Add datechecks permissions to system roles (safe to run repeatedly)."

    def handle(self, *args, **options):
        updated = ensure_datechecks_permissions_on_roles()
        self.stdout.write(
            self.style.SUCCESS(
                f"Updated {updated} role(s) with datechecks permissions."
            )
        )
