import { getAccessToken } from "./client";
import { apiRequest, ApiError } from "./client";
import type {
  AssignableUser,
  Enrolment,
  PaginatedHistory,
  ProgrammeDetail,
  ProgrammeOverviewItem,
  ProgrammeSummary,
  TrainingComment,
  TrainingDashboardSummary,
  TrainingNavBadge,
  TrainingProgress,
  TrainingStep,
} from "../types/training";

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function locationTrainingBase(locationId: string) {
  return `/api/locations/${locationId}/training`;
}

function unwrapList<T>(data: T[] | { results?: T[] }): T[] {
  return Array.isArray(data) ? data : (data.results ?? []);
}

export async function apiFormRequest<T>(
  path: string,
  formData: FormData,
  method: "POST" | "PUT" = "POST",
): Promise<T> {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { method, headers, body: formData });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      typeof data === "object" && data && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : res.statusText;
    throw new ApiError(detail, res.status, data);
  }
  return data as T;
}

export function fetchLocationProgrammes(
  locationId: string,
  filters: {
    status?: string;
    category?: string;
    is_mandatory?: boolean;
  } = {},
) {
  const query = buildQuery({
    status: filters.status,
    category: filters.category,
    is_mandatory: filters.is_mandatory,
  });
  return apiRequest<ProgrammeSummary[] | { results: ProgrammeSummary[] }>(
    `${locationTrainingBase(locationId)}/${query}`,
  ).then(unwrapList);
}

export function fetchOrgProgrammes(filters: { status?: string; category?: string } = {}) {
  const query = buildQuery(filters);
  return apiRequest<{ results: ProgrammeSummary[] } | ProgrammeSummary[]>(
    `/api/org/training/${query}`,
  ).then((data) => (Array.isArray(data) ? data : data.results ?? []));
}

export function fetchOrgProgramme(programmeId: string) {
  return apiRequest<ProgrammeDetail>(`/api/org/training/${programmeId}/`);
}

export function createOrgProgramme(data: Record<string, unknown>) {
  return apiRequest<ProgrammeDetail>("/api/org/training/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateOrgProgramme(programmeId: string, data: Record<string, unknown>) {
  return apiRequest<ProgrammeDetail>(`/api/org/training/${programmeId}/`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteOrgProgramme(programmeId: string) {
  return apiRequest<void>(`/api/org/training/${programmeId}/`, {
    method: "DELETE",
  });
}

export function publishOrgProgramme(programmeId: string) {
  return apiRequest<ProgrammeDetail>(
    `/api/org/training/${programmeId}/publish/`,
    { method: "POST" },
  );
}

export function archiveOrgProgramme(programmeId: string) {
  return apiRequest<ProgrammeDetail>(
    `/api/org/training/${programmeId}/archive/`,
    { method: "POST" },
  );
}

export function fetchOrgSteps(programmeId: string) {
  return apiRequest<TrainingStep[]>(`/api/org/training/${programmeId}/steps/`);
}

export function createOrgStep(programmeId: string, formData: FormData) {
  return apiFormRequest<TrainingStep>(
    `/api/org/training/${programmeId}/steps/`,
    formData,
    "POST",
  );
}

export function updateOrgStep(programmeId: string, stepId: string, formData: FormData) {
  return apiFormRequest<TrainingStep>(
    `/api/org/training/${programmeId}/steps/${stepId}/`,
    formData,
    "PUT",
  );
}

export function deleteOrgStep(programmeId: string, stepId: string) {
  return apiRequest<void>(`/api/org/training/${programmeId}/steps/${stepId}/`, {
    method: "DELETE",
  });
}

export function reorderOrgSteps(programmeId: string, stepIds: string[]) {
  return apiRequest<TrainingStep[]>(
    `/api/org/training/${programmeId}/steps/reorder/`,
    {
      method: "POST",
      body: JSON.stringify({ step_ids: stepIds }),
    },
  );
}

export function enrolInProgramme(locationId: string, programmeId: string) {
  return apiRequest<Enrolment>(
    `${locationTrainingBase(locationId)}/${programmeId}/enrol/`,
    { method: "POST" },
  );
}

export function assignProgramme(
  locationId: string,
  programmeId: string,
  userIds: string[],
) {
  return apiRequest<Enrolment[]>(
    `${locationTrainingBase(locationId)}/${programmeId}/assign/`,
    {
      method: "POST",
      body: JSON.stringify({ user_ids: userIds }),
    },
  );
}

export function fetchTrainingProgress(locationId: string, programmeId: string) {
  return apiRequest<TrainingProgress>(
    `${locationTrainingBase(locationId)}/${programmeId}/progress/`,
  );
}

export function completeTrainingStep(
  locationId: string,
  programmeId: string,
  stepId: string,
  body: { acknowledged?: boolean; notes?: string },
) {
  return apiRequest(
    `${locationTrainingBase(locationId)}/${programmeId}/steps/${stepId}/complete/`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function fetchProgrammeEnrolments(
  locationId: string,
  programmeId: string,
  status?: string,
) {
  const query = buildQuery({ status });
  return apiRequest<Enrolment[]>(
    `${locationTrainingBase(locationId)}/${programmeId}/enrolments/${query}`,
  );
}

export function fetchTrainingOverview(locationId: string) {
  return apiRequest<ProgrammeOverviewItem[]>(
    `${locationTrainingBase(locationId)}/overview/`,
  );
}

export function fetchTrainingDashboardSummary(locationId: string) {
  return apiRequest<TrainingDashboardSummary>(
    `${locationTrainingBase(locationId)}/dashboard-summary/`,
  );
}

export function fetchAssignableUsers(locationId: string) {
  return apiRequest<AssignableUser[]>(
    `${locationTrainingBase(locationId)}/assignable-users/`,
  );
}

export function fetchTrainingComments(programmeId: string, stepId?: string) {
  const query = buildQuery({ step_id: stepId });
  return apiRequest<TrainingComment[]>(
    `/api/org/training/${programmeId}/comments/${query}`,
  );
}

export function createTrainingComment(
  programmeId: string,
  body: string,
  stepId?: string | null,
) {
  return apiRequest<TrainingComment>(
    `/api/org/training/${programmeId}/comments/`,
    {
      method: "POST",
      body: JSON.stringify({ body, step_id: stepId ?? null }),
    },
  );
}

export function fetchTrainingHistory(filters: {
  status?: string;
  category?: string;
  page?: number;
} = {}) {
  const query = buildQuery(filters);
  return apiRequest<PaginatedHistory>(`/api/org/training/history/${query}`);
}

/** Sidebar badge: incomplete mandatory programmes; red if any not started, else amber */
export async function fetchTrainingNavBadge(
  locationId: string,
): Promise<TrainingNavBadge> {
  const programmes = await fetchLocationProgrammes(locationId, {
    status: "published",
    is_mandatory: true,
  });
  const incomplete = programmes.filter((p) => {
    if (!p.user_enrolment) return true;
    return p.user_enrolment.status !== "completed";
  });
  if (incomplete.length === 0) {
    return { count: 0, tone: "hidden" };
  }
  const hasNotStarted = incomplete.some(
    (p) =>
      !p.user_enrolment || p.user_enrolment.status === "not_started",
  );
  return {
    count: incomplete.length,
    tone: hasNotStarted ? "red" : "amber",
  };
}

export async function fetchAllProgrammesForManage(
  locationId: string,
): Promise<ProgrammeSummary[]> {
  const statuses = ["draft", "published", "archived"] as const;
  const lists = await Promise.all(
    statuses.map((status) => fetchLocationProgrammes(locationId, { status })),
  );
  const map = new Map<string, ProgrammeSummary>();
  for (const list of lists) {
    for (const p of list) map.set(p.id, p);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.title.localeCompare(b.title),
  );
}
