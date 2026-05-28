import { apiRequest } from "./client";
import type {
  AdjustStockPayload,
  PaginatedResponse,
  StockAdjustment,
  StockDetail,
  StockFilters,
  StockItemDateCheckHistory,
  StockListItem,
  StockTakeDetail,
  StockTakeEntryInput,
  StockTakeSummary,
} from "../types/inventory";

function buildQuery(params: Record<string, string | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function stockBase(locationId: string) {
  return `/api/locations/${locationId}/stock`;
}

function stockTakesBase(locationId: string) {
  return `/api/locations/${locationId}/stock-takes`;
}

async function fetchPaginatedStock(
  locationId: string,
  page: number,
  filters: StockFilters,
): Promise<PaginatedResponse<StockListItem>> {
  const query = buildQuery({
    page: String(page),
    category: filters.category,
    below_par:
      filters.below_par === true
        ? "true"
        : filters.below_par === false
          ? "false"
          : undefined,
    sort: filters.sort,
  });
  return apiRequest<PaginatedResponse<StockListItem>>(
    `${stockBase(locationId)}/${query || ""}`,
  );
}

export async function fetchAllStock(
  locationId: string,
  filters: StockFilters = {},
): Promise<StockListItem[]> {
  const items: StockListItem[] = [];
  let page = 1;
  while (true) {
    const data = await fetchPaginatedStock(locationId, page, filters);
    items.push(...data.results);
    if (!data.next) break;
    page += 1;
  }
  return items;
}

export function fetchStockAlerts(locationId: string) {
  return apiRequest<StockListItem[]>(`${stockBase(locationId)}/alerts/`);
}

export function fetchStockDetail(locationId: string, stockItemId: string) {
  return apiRequest<StockDetail>(`${stockBase(locationId)}/${stockItemId}/`);
}

export function updateLocationStock(
  locationId: string,
  stockItemId: string,
  payload: { par_level: number; unit_cost: number | string },
) {
  return apiRequest<StockListItem>(
    `${stockBase(locationId)}/${stockItemId}/`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export function adjustStock(locationId: string, payload: AdjustStockPayload) {
  return apiRequest<StockAdjustment>(`${stockBase(locationId)}/adjust/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchAdjustments(
  locationId: string,
  params: { stock_item_id?: string; adjustment_type?: string } = {},
) {
  const query = buildQuery(params);
  return apiRequest<StockAdjustment[]>(
    `${stockBase(locationId)}/adjustments/${query || ""}`,
  );
}

function unwrapList<T>(data: T[] | PaginatedResponse<T>): T[] {
  return Array.isArray(data) ? data : (data.results ?? []);
}

export async function fetchStockTakes(locationId: string) {
  const data = await apiRequest<
    StockTakeSummary[] | PaginatedResponse<StockTakeSummary>
  >(`${stockTakesBase(locationId)}/`);
  return unwrapList(data);
}

export function fetchStockTake(locationId: string, stockTakeId: string) {
  return apiRequest<StockTakeDetail>(
    `${stockTakesBase(locationId)}/${stockTakeId}/`,
  );
}

export function createStockTake(locationId: string, notes = "") {
  return apiRequest<{ stock_take_id: string }>(
    `${stockTakesBase(locationId)}/`,
    {
      method: "POST",
      body: JSON.stringify({ notes }),
    },
  );
}

export function submitStockTakeEntries(
  locationId: string,
  stockTakeId: string,
  entries: StockTakeEntryInput[],
) {
  return apiRequest<{
    stock_take_id: string;
    entries: StockTakeDetail["entries"];
    items_counted: number;
    total_variance: number;
  }>(`${stockTakesBase(locationId)}/${stockTakeId}/entries/`, {
    method: "POST",
    body: JSON.stringify({ entries }),
  });
}

export interface StockItemCreatePayload {
  name: string;
  category: string;
  unit: string;
  preferred_suppliers?: string[];
}

export interface OrgStockItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  preferred_suppliers: string[];
  is_active: boolean;
  created_at: string;
}

export function createOrgStockItem(payload: StockItemCreatePayload) {
  return apiRequest<OrgStockItem>("/api/org/stock-items/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchStockItemDateCheckHistory(
  locationId: string,
  stockItemId: string,
) {
  return apiRequest<StockItemDateCheckHistory[]>(
    `${stockBase(locationId)}/${stockItemId}/date-check-history/`,
  );
}

export async function fetchStockTakeHistoryForItem(
  locationId: string,
  stockItemId: string,
  limit = 10,
) {
  const takes = await fetchStockTakes(locationId);
  if (!takes.length) return [];
  const recent = takes.slice(0, limit);
  const details = await Promise.all(
    recent.map((t) => fetchStockTake(locationId, t.id)),
  );
  return details.flatMap((take) =>
    take.entries
      .filter((e) => e.stock_item === stockItemId)
      .map((entry) => ({
        stock_take_id: take.id,
        conducted_at: take.conducted_at,
        conducted_by_name: take.conducted_by_name,
        entry,
      })),
  );
}
