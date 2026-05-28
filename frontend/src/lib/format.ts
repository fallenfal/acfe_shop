import { formatDistanceToNow, parseISO } from "date-fns";

export function formatRelativeTime(iso: string) {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatCurrency(value: number | string) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number.isFinite(n) ? n : 0);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
