"""Build absolute URLs for uploaded files (training images, avatars, etc.)."""

from django.conf import settings


def absolute_media_url(file_field) -> str | None:
    """
    Return a browser-loadable URL for a FileField/ImageField.

    In production (DEBUG=False) Django does not serve /media/ unless configured;
    use PUBLIC_BASE_URL (e.g. https://teamcafe.cloud) so the SPA loads images from
    the public site, not 127.0.0.1 or a bare relative path that 404s.
    """
    if not file_field:
        return None
    try:
        path = file_field.url
    except (ValueError, AttributeError):
        return None
    if not path.startswith("/"):
        media_prefix = settings.MEDIA_URL.strip("/")
        path = f"/{media_prefix}/{path}".replace("//", "/")
    base = getattr(settings, "PUBLIC_BASE_URL", "") or ""
    if base:
        return f"{base.rstrip('/')}{path}"
    return path
