import { refreshAccessToken } from "./auth";

const ACCESS_KEY = "acfe_access_token";

let refreshPromise: Promise<string> | null = null;

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem("acfe_refresh_token", refresh);
}

export function setAccessToken(access: string) {
  localStorage.setItem(ACCESS_KEY, access);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem("acfe_refresh_token");
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export function formatApiError(err: unknown, fallback = "Request failed."): string {
  if (!(err instanceof ApiError)) return fallback;
  const data = err.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (key === "detail") continue;
      if (Array.isArray(value)) parts.push(`${key}: ${value.map(String).join(", ")}`);
      else if (typeof value === "string") parts.push(value);
    }
    if (parts.length) return parts.join(" ");
  }
  return err.message || fallback;
}

async function refreshAccessTokenOnce(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function isFormDataBody(body: RequestInit["body"]): boolean {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  retryOnUnauthorized = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  // FormData must not get Content-Type: application/json — the browser sets
  // multipart boundary. Forcing JSON breaks waste, date-check photos, etc.
  if (!headers.has("Content-Type") && options.body && !isFormDataBody(options.body)) {
    headers.set("Content-Type", "application/json");
  }

  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401 && retryOnUnauthorized) {
    try {
      await refreshAccessTokenOnce();
      return apiRequest<T>(path, options, false);
    } catch {
      clearTokens();
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const detail =
      typeof data === "object" && data && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : text?.slice(0, 200) || res.statusText;
    throw new ApiError(detail, res.status, data);
  }

  if (!text) {
    return undefined as T;
  }
  if (data === null) {
    throw new ApiError(
      "Server returned a non-JSON response. Check deploy logs (docker compose logs web).",
      res.status,
      text,
    );
  }

  return data as T;
}
