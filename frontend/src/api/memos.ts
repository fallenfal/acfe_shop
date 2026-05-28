import { apiRequest } from "./client";
import type {
  MemoCreatePayload,
  MemoDetail,
  MemoFilters,
  MemoListItem,
  PaginatedResponse,
} from "../types/memo";

function buildQuery(params: Record<string, string | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function memosBase(locationId: string) {
  return `/api/locations/${locationId}/memos`;
}

const HIGHLIGHT_PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  important: 1,
  normal: 2,
};

/** Pinned memos plus important/urgent priority, deduped and sorted for dashboard. */
export async function fetchHighlightedMemos(
  locationId: string,
  limit = 6,
) {
  const [pinned, urgent, important] = await Promise.all([
    fetchMemos(locationId, 1, { is_pinned: true }),
    fetchMemos(locationId, 1, { priority: "urgent" }),
    fetchMemos(locationId, 1, { priority: "important" }),
  ]);

  const byId = new Map<string, (typeof pinned.results)[number]>();
  for (const memo of [
    ...pinned.results,
    ...urgent.results,
    ...important.results,
  ]) {
    if (memo.is_pinned || memo.priority !== "normal") {
      byId.set(memo.id, memo);
    }
  }

  return [...byId.values()]
    .sort((a, b) => {
      const pinDiff = Number(b.is_pinned) - Number(a.is_pinned);
      if (pinDiff !== 0) return pinDiff;
      const priDiff =
        (HIGHLIGHT_PRIORITY_RANK[a.priority] ?? 2) -
        (HIGHLIGHT_PRIORITY_RANK[b.priority] ?? 2);
      if (priDiff !== 0) return priDiff;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    })
    .slice(0, limit);
}

export function fetchMemos(
  locationId: string,
  page = 1,
  filters: MemoFilters = {},
) {
  const query = buildQuery({
    page: String(page),
    category: filters.category || undefined,
    priority: filters.priority || undefined,
    is_pinned:
      filters.is_pinned === true
        ? "true"
        : filters.is_pinned === false
          ? "false"
          : undefined,
  });
  const suffix = query ? `/${query}` : "/";
  return apiRequest<PaginatedResponse<MemoListItem>>(`${memosBase(locationId)}${suffix}`);
}

export function fetchUnreadCount(locationId: string) {
  return apiRequest<{ count: number }>(
    `${memosBase(locationId)}/unread-count/`,
  );
}

export function fetchMemo(locationId: string, memoId: string) {
  return apiRequest<MemoDetail>(`${memosBase(locationId)}/${memoId}/`);
}

export function createMemo(locationId: string, payload: MemoCreatePayload) {
  return apiRequest<MemoDetail>(`${memosBase(locationId)}/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMemo(
  locationId: string,
  memoId: string,
  payload: Partial<MemoCreatePayload>,
) {
  return apiRequest<MemoDetail>(`${memosBase(locationId)}/${memoId}/`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteMemo(
  locationId: string,
  memoId: string,
  hard = false,
) {
  const suffix = hard ? "?hard=true" : "";
  return apiRequest<void>(`${memosBase(locationId)}/${memoId}/${suffix}`, {
    method: "DELETE",
  });
}

export function acknowledgeMemo(locationId: string, memoId: string) {
  return apiRequest<{ is_read: boolean; created: boolean }>(
    `${memosBase(locationId)}/${memoId}/acknowledge/`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function addMemoComment(
  locationId: string,
  memoId: string,
  body: string,
) {
  return apiRequest<{ id: string; body: string }>(
    `${memosBase(locationId)}/${memoId}/comments/`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    },
  );
}
