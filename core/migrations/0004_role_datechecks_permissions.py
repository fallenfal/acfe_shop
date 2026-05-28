"""Grant datechecks permissions on roles seeded before the datechecks module."""

from django.db import migrations

from core.role_permissions import DATECHECKS_BY_SLUG


def merge_datechecks_permissions(apps, schema_editor):
    Role = apps.get_model("core", "Role")
    for slug, datechecks in DATECHECKS_BY_SLUG.items():
        for role in Role.objects.filter(slug=slug):
            permissions = dict(role.permissions or {})
            if permissions.get("datechecks") == datechecks:
                continue
            permissions["datechecks"] = datechecks
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_alter_role_permissions"),
    ]

    operations = [
        migrations.RunPython(merge_datechecks_permissions, noop_reverse),
    ]
