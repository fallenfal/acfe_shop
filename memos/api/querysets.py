"""Query helpers that work on PostgreSQL and SQLite."""

from django.db import connection
from django.db.models import Q


def filter_memos_for_user_role(queryset, role_slug):
    """
    Memos visible to a role: empty target_roles (all staff) or role slug in the list.
    PostgreSQL supports JSON contains; SQLite uses a quoted substring match.
    """
    if not role_slug:
        return queryset

    if connection.vendor == "postgresql":
        return queryset.filter(
            Q(target_roles=[]) | Q(target_roles__contains=[role_slug])
        )

    return queryset.filter(
        Q(target_roles=[]) | Q(target_roles__icontains=f'"{role_slug}"')
    )
