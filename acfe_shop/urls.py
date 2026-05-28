"""
URL configuration for acfe_shop project.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import FileResponse, Http404, HttpResponse
from django.urls import include, path, re_path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.api.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


def _frontend_dist():
    dist = settings.FRONTEND_DIST
    if not dist.is_dir():
        return None
    return dist


def serve_frontend_asset(request, path: str):
    dist = _frontend_dist()
    if dist is None:
        raise Http404("Frontend not built")
    file_path = (dist / "assets" / path).resolve()
    if not str(file_path).startswith(str((dist / "assets").resolve()):
        raise Http404()
    if not file_path.is_file():
        raise Http404()
    return FileResponse(file_path.open("rb"))


def serve_spa_index(request):
    dist = _frontend_dist()
    if dist is None:
        return HttpResponse(
            "<h1>ACFE Shop API</h1><p>Frontend not built. API is at <code>/api/</code>.</p>",
            content_type="text/html",
        )
    index = dist / "index.html"
    if not index.is_file():
        raise Http404()
    return HttpResponse(index.read_text(encoding="utf-8"), content_type="text/html")


urlpatterns += [
    re_path(r"^assets/(?P<path>.*)$", serve_frontend_asset),
    re_path(r"^(?!api/|admin/|media/|static/).*$", serve_spa_index),
]
