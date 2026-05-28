import { apiRequest, getAccessToken, setTokens } from "./client";
import type { LoginResponse, User } from "../types/user";

export async function login(email: string, password: string) {
  const data = await apiRequest<LoginResponse>("/api/auth/login/", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setTokens(data.access, data.refresh);
  return data;
}

export async function fetchMe() {
  return apiRequest<User>("/api/auth/me/");
}

export async function refreshAccessToken(): Promise<string> {
  const refresh = localStorage.getItem("acfe_refresh_token");
  if (!refresh) {
    throw new Error("No refresh token");
  }
  const res = await fetch("/api/auth/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      typeof data === "object" && data && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : "Token refresh failed",
    );
  }
  const access = (data as { access: string }).access;
  localStorage.setItem("acfe_access_token", access);
  return access;
}

export async function logout(refresh: string) {
  return apiRequest<void>("/api/auth/logout/", {
    method: "POST",
    body: JSON.stringify({ refresh }),
  });
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem("acfe_refresh_token");
}

export function hasStoredSession(): boolean {
  return Boolean(getAccessToken() || getStoredRefreshToken());
}
