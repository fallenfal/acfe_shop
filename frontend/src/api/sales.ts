import { apiRequest } from "./client";
import type {
  OrgSalesComparison,
  ProductPerformance,
  SalesDashboard,
  SalesTrends,
  TrendsPeriod,
} from "../types/sales";

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function salesBase(locationId: string) {
  return `/api/locations/${locationId}/sales`;
}

function actionPath(base: string, action: string, query: string) {
  const suffix = query || "/";
  return `${base}/${action}${suffix}`;
}

export function fetchSalesDashboard(locationId: string, date: string) {
  const query = buildQuery({ date });
  return apiRequest<SalesDashboard>(
    actionPath(salesBase(locationId), "dashboard", query),
  );
}

export function fetchSalesTrends(locationId: string, period: TrendsPeriod) {
  const query = buildQuery({ period });
  return apiRequest<SalesTrends>(
    actionPath(salesBase(locationId), "trends", query),
  );
}

export function fetchProductPerformance(
  locationId: string,
  dateFrom: string,
  dateTo: string,
  category?: string,
) {
  const query = buildQuery({
    date_from: dateFrom,
    date_to: dateTo,
    category,
  });
  return apiRequest<ProductPerformance>(
    actionPath(salesBase(locationId), "product-performance", query),
  );
}

export function fetchOrgSalesComparison(dateFrom: string, dateTo: string) {
  const query = buildQuery({ date_from: dateFrom, date_to: dateTo });
  const suffix = query || "/";
  return apiRequest<OrgSalesComparison>(`/api/org/sales/comparison${suffix}`);
}
