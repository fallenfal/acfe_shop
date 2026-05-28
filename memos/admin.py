from django.contrib import admin

from .models import Memo, MemoAcknowledgement, MemoComment


class MemoAcknowledgementInline(admin.TabularInline):
    model = MemoAcknowledgement
    extra = 0


class MemoCommentInline(admin.TabularInline):
    model = MemoComment
    extra = 0


@admin.register(Memo)
class MemoAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "location",
        "author",
        "priority",
        "category",
        "is_pinned",
        "created_at",
    )
    list_filter = ("priority", "category", "location")
    inlines = [MemoAcknowledgementInline, MemoCommentInline]


@admin.register(MemoAcknowledgement)
class MemoAcknowledgementAdmin(admin.ModelAdmin):
    list_display = ("memo", "user", "acknowledged_at")


@admin.register(MemoComment)
class MemoCommentAdmin(admin.ModelAdmin):
    list_display = ("memo", "user", "created_at")
