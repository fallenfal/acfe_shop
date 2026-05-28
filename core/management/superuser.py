"""
Ensure the Django admin superuser exists for local / dev environments.
"""

import os

from core.models import User

SUPERUSER_USERNAME = os.environ.get("DJANGO_SUPERUSER_USERNAME", "admin")
SUPERUSER_EMAIL = os.environ.get("DJANGO_SUPERUSER_EMAIL", "admin@acfe.coffee")
SUPERUSER_PASSWORD = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "admin2024!")


def ensure_dev_superuser():
    """
    Create or update the master admin account (is_staff + is_superuser).
    Returns (user, created) where created is True only on first insert.
    """
    user, created = User.objects.get_or_create(
        username=SUPERUSER_USERNAME,
        defaults={
            "email": SUPERUSER_EMAIL,
            "is_staff": True,
            "is_superuser": True,
            "is_active": True,
        },
    )

    user.email = SUPERUSER_EMAIL
    user.is_staff = True
    user.is_superuser = True
    user.is_active = True
    user.set_password(SUPERUSER_PASSWORD)
    user.save()

    return user, created
