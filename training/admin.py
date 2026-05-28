from django.contrib import admin

from .models import (
    StepCompletion,
    TrainingComment,
    TrainingEnrolment,
    TrainingProgramme,
    TrainingStep,
)


@admin.register(TrainingProgramme)
class TrainingProgrammeAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "category",
        "status",
        "is_mandatory",
        "step_count",
        "created_by",
        "created_at",
    )
    list_filter = ("status", "category", "is_mandatory")


@admin.register(TrainingStep)
class TrainingStepAdmin(admin.ModelAdmin):
    list_display = ("programme", "order", "title", "requires_acknowledgement")
    list_filter = ("programme",)


@admin.register(TrainingEnrolment)
class TrainingEnrolmentAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "programme",
        "location",
        "status",
        "progress_percentage",
        "current_step",
        "started_at",
        "completed_at",
    )
    list_filter = ("status", "programme", "location")


@admin.register(StepCompletion)
class StepCompletionAdmin(admin.ModelAdmin):
    list_display = ("enrolment", "step", "acknowledged", "completed_at")


@admin.register(TrainingComment)
class TrainingCommentAdmin(admin.ModelAdmin):
    list_display = ("user", "programme", "step", "created_at")
