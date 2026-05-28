"""Query helpers and step ordering for the training API."""

from django.db import transaction
from django.db.models import Count, Q

from core.models import Location, User, UserLocationRole
from memos.models import Memo
from training.models import TrainingEnrolment, TrainingProgramme, TrainingStep


def programmes_for_location(location):
    """Programmes assigned to this location, or with no location restriction."""
    return (
        TrainingProgramme.objects.filter(organisation=location.organisation)
        .annotate(location_count=Count("locations", distinct=True))
        .filter(Q(location_count=0) | Q(locations=location))
        .distinct()
    )


def mandatory_programmes_for_location(location):
    return programmes_for_location(location).filter(
        is_mandatory=True,
        status=TrainingProgramme.Status.PUBLISHED,
    )


def programme_applies_to_role(programme, role_slug: str) -> bool:
    roles = programme.target_roles or []
    if not roles:
        return True
    return role_slug in roles


def staff_users_at_location(location):
    return (
        User.objects.filter(
            user_location_roles__location=location,
            user_location_roles__role__slug="staff",
            is_active=True,
        )
        .distinct()
        .order_by("first_name", "last_name", "username")
    )


def staff_mandatory_compliance(location) -> dict:
    """
    Bucket each staff member at a location by mandatory training status:
    fully trained (all applicable programmes completed), in progress, or not started.
    """
    programmes = list(mandatory_programmes_for_location(location))
    staff = list(staff_users_at_location(location))
    if not staff:
        return {
            "fully_trained": 0,
            "in_progress": 0,
            "not_started": 0,
            "completion_rate": 0.0,
            "total_staff": 0,
        }

    programme_ids = [p.id for p in programmes]
    enrolments = TrainingEnrolment.objects.filter(
        location=location,
        programme_id__in=programme_ids,
        user_id__in=[u.id for u in staff],
    )
    enrol_by_user_prog = {(e.user_id, e.programme_id): e for e in enrolments}

    role_by_user = {
        row.user_id: row.role.slug
        for row in UserLocationRole.objects.filter(
            location=location,
            user_id__in=[u.id for u in staff],
        ).select_related("role")
    }

    fully_trained = 0
    in_progress = 0
    not_started = 0

    for user in staff:
        role_slug = role_by_user.get(user.id, "staff")
        applicable = [p for p in programmes if programme_applies_to_role(p, role_slug)]
        if not applicable:
            fully_trained += 1
            continue

        statuses = []
        for programme in applicable:
            enrolment = enrol_by_user_prog.get((user.id, programme.id))
            statuses.append(
                enrolment.status
                if enrolment
                else TrainingEnrolment.Status.NOT_STARTED
            )

        if all(s == TrainingEnrolment.Status.COMPLETED for s in statuses):
            fully_trained += 1
        elif all(s == TrainingEnrolment.Status.NOT_STARTED for s in statuses):
            not_started += 1
        else:
            in_progress += 1

    total = len(staff)
    completion_rate = round((fully_trained / total) * 100, 1) if total else 0.0

    return {
        "fully_trained": fully_trained,
        "in_progress": in_progress,
        "not_started": not_started,
        "completion_rate": completion_rate,
        "total_staff": total,
    }


def create_training_publish_memos(programme: TrainingProgramme, author) -> int:
    """Create a location memo when a programme is published. Returns memo count."""
    locations = list(programme.locations.all())
    if not locations:
        locations = list(
            Location.objects.filter(organisation=programme.organisation).order_by(
                "name"
            )
        )
    if not locations:
        return 0

    priority = (
        Memo.Priority.IMPORTANT
        if programme.is_mandatory
        else Memo.Priority.NORMAL
    )
    body = f"A new training programme has been published: {programme.title}."
    if programme.description.strip():
        body += f" {programme.description.strip()}"
    body += " Go to Training to get started."

    created = 0
    for location in locations:
        Memo.objects.create(
            organisation=programme.organisation,
            location=location,
            author=author,
            title=f"New training available: {programme.title}",
            body=body,
            priority=priority,
            category=Memo.Category.GENERAL,
            requires_acknowledgement=False,
        )
        created += 1
    return created


def get_programme_for_location(location, programme_id):
    return programmes_for_location(location).filter(pk=programme_id).first()


def get_org_programme(user, programme_id):
    org = getattr(user, "organisation", None)
    if org is None:
        return None
    return TrainingProgramme.objects.filter(organisation=org, pk=programme_id).first()


def next_step_order(programme):
    last = programme.steps.order_by("-order").values_list("order", flat=True).first()
    return (last or 0) + 1


@transaction.atomic
def reorder_steps_after_delete(programme):
    """Renumber remaining steps to 1..n after a deletion."""
    steps = list(programme.steps.order_by("order"))
    for index, step in enumerate(steps, start=1):
        if step.order != index:
            step.order = index
            step.save(update_fields=["order"])


@transaction.atomic
def reorder_steps(programme, step_ids):
    """
    Set step order from an ordered list of step UUIDs.
    All programme steps must be included exactly once.
    """
    steps_by_id = {str(s.id): s for s in programme.steps.all()}
    if set(step_ids) != set(steps_by_id.keys()):
        raise ValueError("step_ids must include every step exactly once.")
    for order, step_id in enumerate(step_ids, start=1):
        step = steps_by_id[str(step_id)]
        if step.order != order:
            step.order = order
            step.save(update_fields=["order"])
