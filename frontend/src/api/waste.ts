import { apiRequest } from "./client";
import type {
  PaginatedResponse,
  WasteEntry,
  WasteFilters,
  WasteSummary,
  WasteTrends,
} from "../types/waste";

function buildQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function wasteBase(locationId: string) {
  return `/api/locations/${locationId}/waste`;
}

export async function fetchWastePage(
  locationId: string,
  page: number,
  filters: WasteFilters = {},
) {
  const query = buildQuery({
    page: String(page),
    page_size: filters.page_size ? String(filters.page_size) : undefined,
    date_from: filters.date_from,
    date_to: filters.date_to,
    reason: filters.reason,
    reason_group: filters.reason_group,
    shift: filters.shift,
    item_type: filters.item_type,
  });
  return apiRequest<PaginatedResponse<WasteEntry>>(
    `${wasteBase(locationId)}/${query || ""}`,
  );
}

export async function fetchAllWaste(
  locationId: string,
  filters: WasteFilters = {},
): Promise<WasteEntry[]> {
  const items: WasteEntry[] = [];
  let page = 1;
  while (true) {
    const data = await fetchWastePage(locationId, page, {
      ...filters,
      page_size: filters.page_size ?? 100,
    });
    items.push(...data.results);
    if (!data.next) break;
    page += 1;
  }
  return items;
}

export function fetchWasteEntry(locationId: string, id: string) {
  return apiRequest<WasteEntry>(`${wasteBase(locationId)}/${id}/`);
}

export function createWasteEntry(locationId: string, body: FormData) {
  return apiRequest<WasteEntry>(`${wasteBase(locationId)}/`, {
    method: "POST",
    body,
  });
}

export function deleteWasteEntry(locationId: string, id: string) {
  return apiRequest<void>(`${wasteBase(locationId)}/${id}/`, {
    method: "DELETE",
  });
}

export function fetchWasteSummary(
  locationId: string,
  params: Record<string, string> = {},
) {
  const query = buildQuery(params);
  const suffix = query ? query : "/";
  return apiRequest<WasteSummary>(`${wasteBase(locationId)}/summary${suffix}`);
}

export function fetchWasteTrends(
  locationId: string,
  params: Record<string, string> = {},
) {
  const query = buildQuery(params);
  const suffix = query ? query : "/";
  return apiRequest<WasteTrends>(`${wasteBase(locationId)}/trends${suffix}`);
}

export type PeriodQuery = Record<string, string>;

export function periodToQuery(
  preset: "week" | "month" | "last30" | "custom",
  customFrom?: string,
  customTo?: string,
): PeriodQuery {
  if (preset === "week") return { period: "week" };
  if (preset === "month") return { period: "month" };
  if (preset === "last30") {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return {
      date_from: from.toISOString().slice(0, 10),
      date_to: to.toISOString().slice(0, 10),
    };
  }
  return {
    date_from: customFrom ?? "",
    date_to: customTo ?? "",
  };
}

export function previousPeriodQuery(
  preset: "week" | "month" | "last30" | "custom",
  customFrom?: string,
  customTo?: string,
): PeriodQuery {
  const now = new Date();
  if (preset === "week") {
    const end = new Date(now);
    end.setDate(end.getDate() - 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return {
      date_from: start.toISOString().slice(0, 10),
      date_to: end.toISOString().slice(0, 10),
    };
  }
  if (preset === "month" || preset === "last30") {
    const end = new Date(now);
    end.setDate(end.getDate() - 30);
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    return {
      date_from: start.toISOString().slice(0, 10),
      date_to: end.toISOString().slice(0, 10),
    };
  }
  if (customFrom && customTo) {
    const start = new Date(customFrom);
    const end = new Date(customTo);
    const days = Math.max(
      Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
      1,
    );
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (days - 1));
    return {
      date_from: prevStart.toISOString().slice(0, 10),
      date_to: prevEnd.toISOString().slice(0, 10),
    };
  }
  return { period: "week" };
}
