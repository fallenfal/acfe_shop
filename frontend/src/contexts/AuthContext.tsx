import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchMe,
  getStoredRefreshToken,
  login as apiLogin,
  logout as apiLogout,
  refreshAccessToken,
} from "../api/auth";
import { clearTokens, getAccessToken } from "../api/client";
import { getAccessTokenExpiryMs } from "../lib/jwt";
import type { User } from "../types/user";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const REFRESH_BUFFER_MS = 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleTokenRefresh = useCallback(() => {
    clearRefreshTimer();
    const token = getAccessToken();
    if (!token || !getStoredRefreshToken()) return;

    const expMs = getAccessTokenExpiryMs(token);
    if (!expMs) return;

    const delay = Math.max(expMs - Date.now() - REFRESH_BUFFER_MS, 0);

    refreshTimerRef.current = setTimeout(async () => {
      try {
        await refreshAccessToken();
        scheduleTokenRefresh();
      } catch {
        clearTokens();
        setUser(null);
      }
    }, delay);
  }, [clearRefreshTimer]);

  const refreshUser = useCallback(async () => {
    const token = getAccessToken();
    const refresh = getStoredRefreshToken();
    if (!token && refresh) {
      try {
        await refreshAccessToken();
      } catch {
        clearTokens();
        setUser(null);
        return;
      }
    }
    if (!getAccessToken()) {
      setUser(null);
      return;
    }
    const profile = await fetchMe();
    setUser(profile);
    scheduleTokenRefresh();
  }, [scheduleTokenRefresh]);

  useEffect(() => {
    refreshUser()
      .catch(() => {
        clearTokens();
        setUser(null);
      })
      .finally(() => setLoading(false));
    return clearRefreshTimer;
  }, [refreshUser, clearRefreshTimer]);

  useEffect(() => {
    function onFocus() {
      if (getAccessToken()) {
        refreshUser().catch(() => undefined);
      }
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      await apiLogin(email, password);
      await refreshUser();
    },
    [refreshUser],
  );

  const logout = useCallback(() => {
    clearRefreshTimer();
    const refresh = getStoredRefreshToken();
    if (refresh) {
      apiLogout(refresh).catch(() => undefined);
    }
    clearTokens();
    setUser(null);
  }, [clearRefreshTimer]);

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser }),
    [user, loading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
