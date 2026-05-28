import { apiRequest } from "./client";
import type {
  DateCheckDetail,
  DateCheckEntry,
  DateCheckEntryInput,
  DateCheckFilters,
  DateCheckSchedule,
  DateCheckScheduleStatus,
  DateCheckSummary,
  ExpiryAlert,
  ExpiryAlertFilters,
  ExpiryAlertSummary,
  PaginatedResponse,
} from "../types/datechecks";

function buildQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function dateChecksBase(locationId: string) {
  return `/api/locations/${locationId}/date-checks`;
}

function expiryAlertsBase(locationId: string) {
  return `/api/locations/${locationId}/expiry-alerts`;
}

function scheduleBase(locationId: string) {
  return `/api/locations/${locationId}/date-check-schedule`;
}

export function fetchDateChecks(
  locationId: string,
  filters: DateCheckFilters = {},
) {
  const query = buildQuery({
    status: filters.status,
    date_from: filters.date_from,
    date_to: filters.date_to,
    page: filters.page,
  });
  return apiRequest<PaginatedResponse<DateCheckSummary> | DateCheckSummary[]>(
    `${dateChecksBase(locationId)}/${query}`,
  ).then((data) =>
    Array.isArray(data) ? data : (data.results ?? []),
  );
}

export async function fetchAllDateChecks(
  locationId: string,
  filters: Omit<DateCheckFilters, "page"> = {},
) {
  const items: DateCheckSummary[] = [];
  let page = 1;
  while (true) {
    const query = buildQuery({ ...filters, page: String(page) });
    const data = await apiRequest<PaginatedResponse<DateCheckSummary>>(
      `${dateChecksBase(locationId)}/${query}`,
    );
    items.push(...data.results);
    if (!data.next) break;
    page += 1;
  }
  return items;
}

export function fetchDateCheck(locationId: string, checkId: string) {
  return apiRequest<DateCheckDetail>(
    `${dateChecksBase(locationId)}/${checkId}/`,
  );
}

export function createDateCheck(
  locationId: string,
  body: { notes?: string } = {},
) {
  return apiRequest<DateCheckSummary>(`${dateChecksBase(locationId)}/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function completeDateCheck(locationId: string, checkId: string) {
  return apiRequest<DateCheckDetail>(
    `${dateChecksBase(locationId)}/${checkId}/complete/`,
    { method: "PUT" },
  );
}

export function deleteDateCheck(locationId: string, checkId: string) {
  return apiRequest<void>(`${dateChecksBase(locationId)}/${checkId}/`, {
    method: "DELETE",
  });
}

function entryFormData(input: DateCheckEntryInput): FormData {
  const form = new FormData();
  if (input.stock_item_id) form.append("stock_item_id", input.stock_item_id);
  if (input.menu_item_id) form.append("menu_item_id", input.menu_item_id);
  if (input.product_name) form.append("product_name", input.product_name);
  form.append("earliest_expiry", input.earliest_expiry);
  form.append("quantity_at_risk", String(input.quantity_at_risk ?? 1));
  if (input.unit) form.append("unit", input.unit);
  if (input.action_taken) form.append("action_taken", input.action_taken);
  if (input.action_note) form.append("action_note", input.action_note);
  if (input.photo) form.append("photo", input.photo);
  return form;
}

export function createDateCheckEntry(
  locationId: string,
  checkId: string,
  input: DateCheckEntryInput,
) {
  return apiRequest<DateCheckEntry>(
    `${dateChecksBase(locationId)}/${checkId}/entries/`,
    { method: "POST", body: entryFormData(input) },
  );
}

export function batchCreateDateCheckEntries(
  locationId: string,
  checkId: string,
  entries: DateCheckEntryInput[],
) {
  return apiRequest<DateCheckEntry[]>(
    `${dateChecksBase(locationId)}/${checkId}/entries/batch/`,
    {
      method: "POST",
      body: JSON.stringify({ entries }),
    },
  );
}

export function updateDateCheckEntry(
  locationId: string,
  checkId: string,
  entryId: string,
  input: Partial<DateCheckEntryInput>,
) {
  const hasFile = input.photo instanceof File;
  if (hasFile) {
    return apiRequest<DateCheckEntry>(
      `${dateChecksBase(locationId)}/${checkId}/entries/${entryId}/`,
      { method: "PUT", body: entryFormData(input as DateCheckEntryInput) },
    );
  }
  return apiRequest<DateCheckEntry>(
    `${dateChecksBase(locationId)}/${checkId}/entries/${entryId}/`,
    {
      method: "PUT",
      body: JSON.stringify({
        earliest_expiry: input.earliest_expiry,
        quantity_at_risk: input.quantity_at_risk,
        unit: input.unit,
        action_taken: input.action_taken,
        action_note: input.action_note,
      }),
    },
  );
}

export function deleteDateCheckEntry(
  locationId: string,
  checkId: string,
  entryId: string,
) {
  return apiRequest<void>(
    `${dateChecksBase(locationId)}/${checkId}/entries/${entryId}/`,
    { method: "DELETE" },
  );
}

export function fetchExpiryAlerts(
  locationId: string,
  filters: ExpiryAlertFilters = {},
) {
  const query = buildQuery({
    alert_level: filters.alert_level,
    resolution: filters.resolution ?? "pending",
    page: filters.page,
  });
  return apiRequest<PaginatedResponse<ExpiryAlert> | ExpiryAlert[]>(
    `${expiryAlertsBase(locationId)}/${query}`,
  ).then((data) => (Array.isArray(data) ? data : (data.results ?? [])));
}

export async function fetchAllExpiryAlerts(
  locationId: string,
  filters: Omit<ExpiryAlertFilters, "page"> = {},
) {
  const items: ExpiryAlert[] = [];
  let page = 1;
  while (true) {
    const query = buildQuery({
      ...filters,
      resolution: filters.resolution ?? "pending",
      page: String(page),
    });
    const data = await apiRequest<PaginatedResponse<ExpiryAlert>>(
      `${expiryAlertsBase(locationId)}/${query}`,
    );
    items.push(...data.results);
    if (!data.next) break;
    page += 1;
  }
  return items;
}

export function fetchExpiryAlertSummary(locationId: string) {
  return apiRequest<ExpiryAlertSummary>(
    `${expiryAlertsBase(locationId)}/summary/`,
  );
}

export function resolveExpiryAlert(
  locationId: string,
  alertId: string,
  body: { resolution: string; resolved_note?: string },
) {
  return apiRequest<ExpiryAlert>(
    `${expiryAlertsBase(locationId)}/${alertId}/resolve/`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export function bulkResolveExpiryAlerts(
  locationId: string,
  body: { alert_ids: string[]; resolution: string; resolved_note?: string },
) {
  return apiRequest<ExpiryAlert[]>(
    `${expiryAlertsBase(locationId)}/bulk-resolve/`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function fetchDateCheckSchedule(locationId: string) {
  return apiRequest<DateCheckSchedule>(`${scheduleBase(locationId)}/`);
}

export function updateDateCheckSchedule(
  locationId: string,
  body: Partial<
    Pick<
      DateCheckSchedule,
      | "frequency"
      | "alert_threshold_days"
      | "reminder_enabled"
      | "reminder_time"
    >
  >,
) {
  return apiRequest<DateCheckSchedule>(`${scheduleBase(locationId)}/`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function fetchDateCheckScheduleStatus(locationId: string) {
  return apiRequest<DateCheckScheduleStatus>(
    `${scheduleBase(locationId)}/status/`,
  );
}

export type DateCheckNavBadge = {
  count: number;
  tone: "red" | "amber" | "hidden";
};

/** Sidebar badge: expired + critical only; red if any expired, else amber */
export async function fetchDateCheckNavBadge(
  locationId: string,
): Promise<DateCheckNavBadge> {
  const summary = await fetchExpiryAlertSummary(locationId);
  const count = summary.expired + summary.critical;
  if (count === 0) {
    return { count: 0, tone: "hidden" };
  }
  if (summary.expired > 0) {
    return { count, tone: "red" };
  }
  return { count, tone: "amber" };
}
