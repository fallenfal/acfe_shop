"""Helpers for writing audit trail entries."""

from activity.models import ActivityLog


def get_client_ip(request):
    if request is None:
        return None
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def log_activity(
    request,
    action_type,
    *,
    organisation,
    location=None,
    target_model="",
    target_id=None,
    details=None,
):
    user = getattr(request, "user", None)
    if user is not None and not user.is_authenticated:
        user = None
    ActivityLog.objects.create(
        organisation=organisation,
        location=location,
        user=user,
        action_type=action_type,
        target_model=target_model,
        target_id=target_id,
        details=details or {},
        ip_address=get_client_ip(request),
    )
