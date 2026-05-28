import { formatDateTime } from "./format";
import { entryActionLabel, expiryStatusLabel } from "./datecheckLabels";
import type { DateCheckDetail } from "../types/datechecks";

function escapeCell(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportDateCheckCsv(check: DateCheckDetail, filename: string) {
  const headers = [
    "Product",
    "Expiry date",
    "Status",
    "Quantity",
    "Unit",
    "Cost (GBP)",
    "Action",
    "Notes",
  ];
  const rows = [...check.entries]
    .sort(
      (a, b) =>
        new Date(a.earliest_expiry).getTime() -
        new Date(b.earliest_expiry).getTime(),
    )
    .map((e) => [
      e.product_name,
      e.earliest_expiry,
      expiryStatusLabel(e.expiry_status),
      String(e.quantity_at_risk),
      e.unit,
      e.estimated_cost,
      entryActionLabel(e.action_taken),
      e.action_note ?? "",
    ]);
  const meta = [
    ["Date check", formatDateTime(check.started_at)],
    ["Conducted by", check.conducted_by_name ?? ""],
    ["Completed", check.completed_at ? formatDateTime(check.completed_at) : ""],
    ["Notes", check.notes ?? ""],
    [],
  ];
  const csv = [...meta, headers, ...rows]
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
