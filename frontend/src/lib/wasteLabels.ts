import type { WasteReason, WasteShift } from "../types/waste";

export const WASTE_REASONS: WasteReason[] = [
  "over_production",
  "expired",
  "customer_return",
  "dropped_spillage",
  "equipment_failure",
  "quality_issue",
  "other",
];

const reasonLabels: Record<WasteReason, string> = {
  over_production: "Over-production",
  expired: "Expired",
  customer_return: "Customer return",
  dropped_spillage: "Dropped / spillage",
  equipment_failure: "Equipment failure",
  quality_issue: "Quality issue",
  other: "Other",
};

const reasonStyles: Record<WasteReason, string> = {
  over_production: "bg-amber-100 text-amber-950",
  expired: "bg-red-100 text-red-900",
  customer_return: "bg-orange-100 text-orange-950",
  dropped_spillage: "bg-rose-100 text-rose-950",
  equipment_failure: "bg-stone-200 text-stone-800",
  quality_issue: "bg-red-50 text-red-800 border border-red-200",
  other: "bg-cream-200 text-brown-800",
};

export function wasteReasonLabel(reason: WasteReason | string): string {
  return reasonLabels[reason as WasteReason] ?? reason;
}

export function wasteReasonStyle(reason: WasteReason | string): string {
  return reasonStyles[reason as WasteReason] ?? "bg-cream-200 text-brown-800";
}

export const WASTE_SHIFTS: WasteShift[] = ["morning", "afternoon", "evening"];

const shiftLabels: Record<WasteShift, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

export function wasteShiftLabel(shift: WasteShift | string): string {
  return shiftLabels[shift as WasteShift] ?? shift;
}

/** Default shift from local time (café hours). */
export function defaultWasteShift(): WasteShift {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function wasteEntryItemName(entry: {
  item_type: string;
  menu_item_name: string | null;
  stock_item_name: string | null;
}): string {
  return entry.menu_item_name ?? entry.stock_item_name ?? "Unknown item";
}

export function formatDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayDateParam(): string {
  return formatDateParam(new Date());
}
