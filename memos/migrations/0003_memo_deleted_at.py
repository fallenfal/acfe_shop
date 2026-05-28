from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("memos", "0002_alter_memo_target_roles"),
    ]

    operations = [
        migrations.AddField(
            model_name="memo",
            name="deleted_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Set when soft-deleted; hidden from API lists",
                null=True,
            ),
        ),
    ]
