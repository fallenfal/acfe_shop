import type { EnrolmentStatus, ProgrammeStatus, TrainingCategory } from "../types/training";

export const TRAINING_CATEGORIES: { value: TrainingCategory; label: string }[] = [
  { value: "onboarding", label: "Onboarding" },
  { value: "food_safety", label: "Food Safety" },
  { value: "barista", label: "Barista Skills" },
  { value: "equipment", label: "Equipment" },
  { value: "customer_service", label: "Customer Service" },
  { value: "health_safety", label: "Health & Safety" },
  { value: "closing", label: "Closing Procedures" },
  { value: "opening", label: "Opening Procedures" },
  { value: "other", label: "Other" },
];

export function categoryLabel(category: TrainingCategory): string {
  return TRAINING_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function statusLabel(status: ProgrammeStatus): string {
  const map: Record<ProgrammeStatus, string> = {
    draft: "Draft",
    published: "Published",
    archived: "Archived",
  };
  return map[status] ?? status;
}

export function enrolmentStatusLabel(status: EnrolmentStatus): string {
  const map: Record<EnrolmentStatus, string> = {
    not_started: "Not Started",
    in_progress: "In Progress",
    completed: "Completed",
  };
  return map[status] ?? status;
}

export function categoryIcon(category: TrainingCategory): string {
  const icons: Record<TrainingCategory, string> = {
    onboarding: "👋",
    food_safety: "🛡️",
    barista: "☕",
    equipment: "⚙️",
    customer_service: "💬",
    health_safety: "⛑️",
    closing: "🌙",
    opening: "🌅",
    other: "📚",
  };
  return icons[category] ?? "📚";
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
