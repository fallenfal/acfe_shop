"""
Ensure the Django admin superuser exists (idempotent).

Usage:
    python manage.py ensure_superuser

Credentials (defaults, override via env):
    Username: admin
    Email:    admin@acfe.coffee
    Password: admin2024!  (set DJANGO_SUPERUSER_PASSWORD)
"""

from django.core.management.base import BaseCommand

from core.management.superuser import (
    SUPERUSER_EMAIL,
    SUPERUSER_PASSWORD,
    SUPERUSER_USERNAME,
    ensure_dev_superuser,
)


class Command(BaseCommand):
    help = "Create or update the Django admin superuser (idempotent)"

    def handle(self, *args, **options):
        user, created = ensure_dev_superuser()
        verb = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{verb} superuser: {user.username}"))
        self._print_credentials()

    def _print_credentials(self):
        self.stdout.write("")
        self.stdout.write("  Django Admin: http://127.0.0.1:8000/admin/")
        self.stdout.write(f"    Username: {SUPERUSER_USERNAME}")
        self.stdout.write(f"    Email:    {SUPERUSER_EMAIL}")
        self.stdout.write(f"    Password: {SUPERUSER_PASSWORD}")
        self.stdout.write("")
        self.stdout.write(
            self.style.WARNING(
                "  Use the username on the admin login form, not the email."
            )
        )
        self.stdout.write(
            self.style.WARNING(
                "  Change DJANGO_SUPERUSER_PASSWORD in production."
            )
        )
