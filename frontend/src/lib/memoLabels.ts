import type { MemoCategory, MemoPriority } from "../types/memo";

export const CATEGORY_OPTIONS: { value: MemoCategory; label: string }[] = [
  { value: "daily_briefing", label: "Daily Briefing" },
  { value: "policy_update", label: "Policy Update" },
  { value: "equipment", label: "Equipment" },
  { value: "menu_change", label: "Menu Change" },
  { value: "health_safety", label: "Health & Safety" },
  { value: "general", label: "General" },
];

export const PRIORITY_OPTIONS: { value: MemoPriority; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "important", label: "Important" },
  { value: "urgent", label: "Urgent" },
];

export const ROLE_OPTIONS = [
  { value: "staff", label: "Staff" },
  { value: "content_manager", label: "Content Manager" },
];

export function categoryLabel(category: MemoCategory): string {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category;
}

export function priorityLabel(priority: MemoPriority): string {
  return PRIORITY_OPTIONS.find((p) => p.value === priority)?.label ?? priority;
}

export function priorityStyles(priority: MemoPriority) {
  switch (priority) {
    case "urgent":
      return {
        badge: "bg-red-100 text-red-800 border-red-200",
        dot: "bg-red-500",
      };
    case "important":
      return {
        badge: "bg-amber-100 text-amber-900 border-amber-200",
        dot: "bg-amber-brand",
      };
    default:
      return {
        badge: "bg-stone-100 text-stone-600 border-stone-200",
        dot: "bg-stone-400",
      };
  }
}
