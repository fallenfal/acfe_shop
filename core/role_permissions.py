"""Default permission trees for system roles (shared by seed and migrations)."""

DATECHECKS_OWNER = {
    "create": True,
    "read": True,
    "resolve_alerts": True,
    "manage_schedule": True,
}

DATECHECKS_CM = {
    "create": True,
    "read": True,
    "resolve_alerts": True,
    "manage_schedule": True,
}

DATECHECKS_STAFF = {
    "create": True,
    "read": True,
}

DATECHECKS_BY_SLUG = {
    "owner": DATECHECKS_OWNER,
    "content_manager": DATECHECKS_CM,
    "staff": DATECHECKS_STAFF,
}

TRAINING_FULL = {
    "create": True,
    "read": True,
    "update": True,
    "delete": True,
    "assign": True,
    "complete": True,
}

TRAINING_OWNER = TRAINING_FULL

TRAINING_CM = TRAINING_FULL

TRAINING_STAFF = {
    "read": True,
    "complete": True,
}

TRAINING_BY_SLUG = {
    "owner": TRAINING_OWNER,
    "content_manager": TRAINING_CM,
    "staff": TRAINING_STAFF,
}


def merge_datechecks_into_role_permissions(permissions: dict, role_slug: str) -> dict:
    """Return permissions with datechecks block set for known system roles."""
    datechecks = DATECHECKS_BY_SLUG.get(role_slug)
    if datechecks is None:
        return permissions
    merged = dict(permissions or {})
    merged["datechecks"] = datechecks
    return merged


def merge_training_into_role_permissions(permissions: dict, role_slug: str) -> dict:
    """Return permissions with training block set for known system roles."""
    training = TRAINING_BY_SLUG.get(role_slug)
    if training is None:
        return permissions
    merged = dict(permissions or {})
    merged["training"] = training
    return merged


def ensure_datechecks_permissions_on_roles(queryset=None):
    """Update roles in the database that are missing datechecks permissions."""
    from core.models import Role

    qs = queryset if queryset is not None else Role.objects.all()
    updated = 0
    for role in qs:
        merged = merge_datechecks_into_role_permissions(role.permissions, role.slug)
        if merged != (role.permissions or {}):
            role.permissions = merged
            role.save(update_fields=["permissions"])
            updated += 1
    return updated


def ensure_training_permissions_on_roles(queryset=None):
    """Update roles in the database that are missing training permissions."""
    from core.models import Role

    qs = queryset if queryset is not None else Role.objects.all()
    updated = 0
    for role in qs:
        merged = merge_training_into_role_permissions(role.permissions, role.slug)
        if merged != (role.permissions or {}):
            role.permissions = merged
            role.save(update_fields=["permissions"])
            updated += 1
    return updated
