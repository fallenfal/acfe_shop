"""Grant training permissions on roles seeded before the training module."""

from django.db import migrations

from core.role_permissions import TRAINING_BY_SLUG


def merge_training_permissions(apps, schema_editor):
    Role = apps.get_model("core", "Role")
    for slug, training in TRAINING_BY_SLUG.items():
        for role in Role.objects.filter(slug=slug):
            permissions = dict(role.permissions or {})
            if permissions.get("training") == training:
                continue
            permissions["training"] = training
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_role_datechecks_permissions"),
    ]

    operations = [
        migrations.RunPython(merge_training_permissions, noop_reverse),
    ]
