"""
ACFE Shop — Training Module Models
Structured training programmes with sequential steps, staff progress tracking,
and a full history of all training content.

This module lives in a new Django app: training/

Add to INSTALLED_APPS: 'training'
Add to URL conf: path('api/locations/<uuid:location_id>/training/', include('training.api.urls'))
"""

import uuid
from django.db import models


# =============================================================================
# MODULE: Training Programmes
# =============================================================================

class TrainingProgramme(models.Model):
    """
    A training programme is a collection of ordered steps that teach
    staff how to do something. Examples:
    - "New Starter Onboarding"
    - "Barista Skills Level 1"
    - "Food Safety & Hygiene"
    - "Closing Procedure"
    - "Allergen Awareness"

    Programmes are defined at org level (shared across locations) but
    assigned to specific locations. A programme can be a draft while
    being built, then published when ready for staff to complete.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    class Category(models.TextChoices):
        ONBOARDING = "onboarding", "Onboarding"
        FOOD_SAFETY = "food_safety", "Food Safety"
        BARISTA = "barista", "Barista Skills"
        EQUIPMENT = "equipment", "Equipment"
        CUSTOMER_SERVICE = "customer_service", "Customer Service"
        HEALTH_SAFETY = "health_safety", "Health & Safety"
        CLOSING = "closing", "Closing Procedures"
        OPENING = "opening", "Opening Procedures"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        "core.Organisation", on_delete=models.CASCADE, related_name="training_programmes"
    )
    title = models.CharField(max_length=300)
    description = models.TextField(
        blank=True,
        help_text="Overview of what this training covers and who it's for"
    )
    category = models.CharField(
        max_length=30, choices=Category.choices, default=Category.OTHER
    )
    cover_image = models.ImageField(
        upload_to="training/covers/", blank=True, null=True,
        help_text="Cover image shown in the training library"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    estimated_duration_minutes = models.PositiveIntegerField(
        default=0,
        help_text="Estimated time to complete all steps, in minutes"
    )
    is_mandatory = models.BooleanField(
        default=False,
        help_text="If true, all staff at assigned locations must complete this"
    )
    target_roles = models.JSONField(
        default=list, blank=True,
        help_text="Which roles should complete this. Empty = all roles. E.g. ['staff', 'content_manager']"
    )
    # Which locations this programme is assigned to
    locations = models.ManyToManyField(
        "core.Location", related_name="training_programmes", blank=True,
        help_text="Locations where this programme is active. Empty = all locations."
    )
    created_by = models.ForeignKey(
        "core.User", on_delete=models.SET_NULL, null=True,
        related_name="created_programmes"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"

    @property
    def step_count(self):
        return self.steps.count()

    def publish(self):
        """Publish the programme, making it available to staff."""
        from django.utils import timezone
        self.status = self.Status.PUBLISHED
        self.published_at = timezone.now()
        self.save()

    def archive(self):
        """Archive the programme. Existing progress is preserved but
        no new enrolments are allowed."""
        self.status = self.Status.ARCHIVED
        self.save()


class TrainingStep(models.Model):
    """
    A single step within a training programme. Steps are ordered and
    form a timeline that staff work through sequentially.

    Each step has:
    - A title (what this step teaches)
    - A description (detailed instructions, tips, key points)
    - An image (photo, diagram, screenshot — visual aid)
    - An order number (position in the timeline)

    Steps can optionally require acknowledgement — staff must confirm
    they've understood before moving to the next step.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    programme = models.ForeignKey(
        TrainingProgramme, on_delete=models.CASCADE, related_name="steps"
    )
    order = models.PositiveIntegerField(
        default=1,
        help_text="Position in the timeline. Steps are displayed in ascending order."
    )
    title = models.CharField(max_length=300)
    description = models.TextField(
        help_text="Detailed instructions, key points, tips. Supports markdown."
    )
    image = models.ImageField(
        upload_to="training/steps/", blank=True, null=True,
        help_text="Visual aid — photo of equipment, diagram, screenshot, etc."
    )
    video_url = models.URLField(
        blank=True,
        help_text="Optional link to an external video (YouTube, Vimeo, etc.)"
    )
    requires_acknowledgement = models.BooleanField(
        default=False,
        help_text="If true, staff must confirm understanding before proceeding"
    )
    tips = models.TextField(
        blank=True,
        help_text="Additional tips or common mistakes to avoid"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order"]
        unique_together = ("programme", "order")

    def __str__(self):
        return f"Step {self.order}: {self.title}"


class TrainingEnrolment(models.Model):
    """
    Tracks a user's enrolment and progress through a training programme.
    Created when a user starts a programme (or is assigned one).

    The enrolment tracks overall status:
    - NOT_STARTED: assigned but not begun
    - IN_PROGRESS: started but not completed all steps
    - COMPLETED: all steps completed
    """

    class Status(models.TextChoices):
        NOT_STARTED = "not_started", "Not Started"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    programme = models.ForeignKey(
        TrainingProgramme, on_delete=models.CASCADE, related_name="enrolments"
    )
    user = models.ForeignKey(
        "core.User", on_delete=models.CASCADE, related_name="training_enrolments"
    )
    location = models.ForeignKey(
        "core.Location", on_delete=models.CASCADE, related_name="training_enrolments"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.NOT_STARTED
    )
    current_step = models.PositiveIntegerField(
        default=1,
        help_text="The step the user is currently on"
    )
    assigned_by = models.ForeignKey(
        "core.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="training_assignments_made"
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("programme", "user", "location")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.username} → {self.programme.title} ({self.get_status_display()})"

    @property
    def progress_percentage(self):
        """Calculate completion percentage."""
        total = self.programme.step_count
        if total == 0:
            return 0
        completed = self.step_completions.count()
        return round((completed / total) * 100)

    def update_status(self):
        """Re-evaluate enrolment status based on step completions."""
        from django.utils import timezone
        total_steps = self.programme.step_count
        completed_steps = self.step_completions.count()

        if completed_steps == 0:
            self.status = self.Status.NOT_STARTED
            self.started_at = None
        elif completed_steps >= total_steps:
            self.status = self.Status.COMPLETED
            if not self.completed_at:
                self.completed_at = timezone.now()
        else:
            self.status = self.Status.IN_PROGRESS
            if not self.started_at:
                self.started_at = timezone.now()
            self.current_step = completed_steps + 1

        self.save()


class StepCompletion(models.Model):
    """
    Records that a user has completed a specific step in a programme.
    This is the granular progress tracking — one record per step per user.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    enrolment = models.ForeignKey(
        TrainingEnrolment, on_delete=models.CASCADE, related_name="step_completions"
    )
    step = models.ForeignKey(
        TrainingStep, on_delete=models.CASCADE, related_name="completions"
    )
    acknowledged = models.BooleanField(
        default=False,
        help_text="True if the user confirmed understanding (for steps that require it)"
    )
    notes = models.TextField(
        blank=True,
        help_text="Optional notes from the user, e.g. questions or feedback"
    )
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("enrolment", "step")
        ordering = ["step__order"]

    def __str__(self):
        return f"{self.enrolment.user.username} completed Step {self.step.order}"


class TrainingComment(models.Model):
    """
    Comments on a training programme — staff can ask questions,
    CMs can post clarifications. Scoped to the programme, not individual steps.
    Useful for Q&A and feedback.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    programme = models.ForeignKey(
        TrainingProgramme, on_delete=models.CASCADE, related_name="comments"
    )
    user = models.ForeignKey(
        "core.User", on_delete=models.CASCADE, related_name="training_comments"
    )
    body = models.TextField()
    # Optional: link to a specific step for contextual questions
    step = models.ForeignKey(
        TrainingStep, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="comments",
        help_text="If set, this comment is about a specific step"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        step_ref = f" (Step {self.step.order})" if self.step else ""
        return f"{self.user.username} on '{self.programme.title}'{step_ref}"
