import { formatDateTime } from "./format";
import { wasteEntryItemName, wasteReasonLabel, wasteShiftLabel } from "./wasteLabels";
import type { WasteEntry } from "../types/waste";

function escapeCell(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportWasteEntriesCsv(entries: WasteEntry[], filename: string) {
  const headers = [
    "Logged at",
    "Item",
    "Type",
    "Quantity",
    "Unit",
    "Reason",
    "Shift",
    "Cost (GBP)",
    "Logged by",
    "Notes",
  ];
  const rows = entries.map((e) => [
    formatDateTime(e.logged_at),
    wasteEntryItemName(e),
    e.item_type,
    String(e.quantity),
    e.unit,
    wasteReasonLabel(e.reason),
    wasteShiftLabel(e.shift),
    e.cost_value,
    e.logged_by_name ?? "",
    e.reason_note ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
