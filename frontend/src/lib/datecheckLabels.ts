import type {
  AlertLevel,
  EntryAction,
  ExpiryStatus,
  ScheduleFrequency,
} from "../types/datechecks";

export const EXPIRY_COLORS = {
  ok: "#639922",
  warning: "#EF9F27",
  critical: "#D85A30",
  expired: "#E24B4A",
} as const;

const statusLabels: Record<ExpiryStatus, string> = {
  ok: "OK",
  warning: "Expiring soon",
  critical: "Expires today/tomorrow",
  expired: "Expired",
};

const alertLabels: Record<AlertLevel, string> = {
  warning: "Warning",
  critical: "Critical",
  expired: "Expired",
};

const actionLabels: Record<EntryAction, string> = {
  none: "No action",
  use_first: "Use first",
  reduce_price: "Reduce price",
  dispose: "Dispose",
  disposed: "Disposed",
};

const frequencyLabels: Record<ScheduleFrequency, string> = {
  daily: "Daily",
  every_other_day: "Every other day",
  twice_weekly: "Twice weekly",
  weekly: "Weekly",
};

export function expiryStatusLabel(status: ExpiryStatus): string {
  return statusLabels[status] ?? status;
}

export function alertLevelLabel(level: AlertLevel): string {
  return alertLabels[level] ?? level;
}

export function entryActionLabel(action: EntryAction): string {
  return actionLabels[action] ?? action;
}

export function scheduleFrequencyLabel(freq: ScheduleFrequency): string {
  return frequencyLabels[freq] ?? freq;
}

export function expiryStatusBadgeClass(status: ExpiryStatus): string {
  switch (status) {
    case "ok":
      return "bg-[#639922]/15 text-[#4a7319] border-[#639922]/30";
    case "warning":
      return "bg-[#EF9F27]/15 text-[#b8781a] border-[#EF9F27]/40";
    case "critical":
      return "bg-[#D85A30]/15 text-[#a84524] border-[#D85A30]/40";
    case "expired":
      return "bg-[#E24B4A]/15 text-[#b33a39] border-[#E24B4A]/40";
    default:
      return "bg-cream-100 text-brown-700";
  }
}

export function alertLevelSectionClass(level: AlertLevel): string {
  switch (level) {
    case "expired":
      return "border-[#E24B4A]/40 bg-[#E24B4A]/5";
    case "critical":
      return "border-[#D85A30]/40 bg-[#D85A30]/5";
    case "warning":
      return "border-[#EF9F27]/40 bg-[#EF9F27]/5";
    default:
      return "border-cream-200 bg-white";
  }
}

export function computeExpiryStatus(
  expiryDate: string,
  thresholdDays = 3,
): ExpiryStatus {
  if (!expiryDate) return "ok";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate + "T00:00:00");
  const diff = Math.floor(
    (exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return "expired";
  if (diff <= 1) return "critical";
  if (diff <= thresholdDays) return "warning";
  return "ok";
}

export function daysUntilExpiryLabel(days: number): string {
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? "1 day ago" : `${n} days ago`;
  }
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export function expectedChecksPerWeek(frequency: ScheduleFrequency): number {
  switch (frequency) {
    case "daily":
      return 7;
    case "every_other_day":
      return 4;
    case "twice_weekly":
      return 2;
    case "weekly":
      return 1;
    default:
      return 7;
  }
}

export function startOfWeekIso(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
