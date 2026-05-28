"""Demo login accounts (ACFE Coffee seed data). Shared by seed and bootstrap."""

from core.models import Organisation, User

DEFAULT_DEMO_PASSWORD = "acfe2024!"

DEMO_ACCOUNT_EMAILS = [
    "jordan@acfe.coffee",
    "sarah.union@acfe.coffee",
    "mike.beach@acfe.coffee",
    "emma.union@acfe.coffee",
    "liam.beach@acfe.coffee",
]


def sync_demo_passwords() -> tuple[str, int]:
    """
    Reset demo user passwords to DEFAULT_DEMO_PASSWORD (idempotent).

    Returns (status, count) where status is:
      - "no_org" — organisation acfe-coffee not found
      - "no_users" — org exists but no demo users
      - "ok" — passwords synced for count users
    """
    org = Organisation.objects.filter(slug="acfe-coffee").first()
    if org is None:
        return "no_org", 0

    synced = 0
    for email in DEMO_ACCOUNT_EMAILS:
        user = User.objects.filter(organisation=org, email__iexact=email).first()
        if not user:
            continue
        user.set_password(DEFAULT_DEMO_PASSWORD)
        user.is_active = True
        user.save()
        synced += 1

    if synced == 0:
        return "no_users", 0
    return "ok", synced
