/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchMe } from "@/api/users";
import { isRefreshRateLimited, refreshAccessToken, revokeRefreshToken } from "@/api/auth";
import { ApiError } from "@/api/client";
import { finishAuthRestore, getAccessToken, setAccessToken } from "@/api/tokenStore";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { decodeJwtPayload } from "@/utils/jwtPayload";
import { mercureTokenCoversTopic } from "@/utils/mercureToken";
import { unsubscribeFromPush } from "@/utils/webPush";
import type { User } from "@/types/api";

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  sessionExpired: boolean;
  mercureToken: string | null;
  refreshMercureToken: () => Promise<void>;
  ensureMercureTopic: (topic: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

function parseTokenExp(token: string): number | null {
  return decodeJwtPayload<{ exp: number }>(token)?.exp ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setTokenState] = useState<string | null>(() => getAccessToken());
  const setToken = useCallback((next: string | null) => {
    setAccessToken(next);
    setTokenState(next);
  }, []);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [mercureToken, setMercureToken] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mercureRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef<User | null>(null);
  const mercureTokenRef = useRef<string | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    mercureTokenRef.current = mercureToken;
  }, [mercureToken]);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const clearMercureTimer = useCallback(() => {
    if (mercureRefreshTimerRef.current !== null) {
      clearTimeout(mercureRefreshTimerRef.current);
      mercureRefreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefreshRef = useRef<(tok: string) => void>(() => {});
  const mercureScheduleRef = useRef<() => Promise<void>>(async () => {});

  // Distinguishes "session is gone" from "ask again shortly": a rate-limited
  // refresh must leave the current session alone, or a burst of reloads signs
  // the user out.
  const rateLimitedRef = useRef(false);

  const doSilentRefresh = useCallback(async (): Promise<string | null> => {
    try {
      const refreshed = await refreshAccessToken();
      rateLimitedRef.current = false;
      return refreshed;
    } catch (err) {
      rateLimitedRef.current = isRefreshRateLimited(err);
      return null;
    }
  }, []);

  const doMercureFetch = useCallback(async () => {
    try {
      const { fetchRealtimeToken } = await import("@/api/realtimeToken");
      const { token: mToken, expiresAt } = await fetchRealtimeToken();
      setMercureToken(mToken);
      clearMercureTimer();
      const rawDelay = expiresAt ? expiresAt * 1000 - Date.now() - 5 * 60 * 1000 : 55 * 60 * 1000;
      const delay = Math.max(rawDelay, 30_000);
      mercureRefreshTimerRef.current = setTimeout(() => void mercureScheduleRef.current(), delay);
    } catch {
      setMercureToken(null);
    }
  }, [clearMercureTimer]);

  const doPublicMercureFetch = useCallback(async () => {
    try {
      const { fetchPublicRealtimeToken } = await import("@/api/realtimeToken");
      const { token: mToken, expiresAt } = await fetchPublicRealtimeToken();
      setMercureToken(mToken);
      clearMercureTimer();
      if (mToken) {
        const rawDelay = expiresAt ? expiresAt * 1000 - Date.now() - 5 * 60 * 1000 : 55 * 60 * 1000;
        const delay = Math.max(rawDelay, 30_000);
        mercureRefreshTimerRef.current = setTimeout(() => void mercureScheduleRef.current(), delay);
      }
    } catch {
      setMercureToken(null);
    }
  }, [clearMercureTimer]);

  const ensureMercureTopic = useCallback(
    (topic: string) => {
      const current = mercureTokenRef.current;
      if (!current || mercureTokenCoversTopic(current, topic)) return;
      void (token ? doMercureFetch() : doPublicMercureFetch());
    },
    [token, doMercureFetch, doPublicMercureFetch],
  );

  useEffect(() => {
    mercureScheduleRef.current = token ? doMercureFetch : doPublicMercureFetch;
  }, [token, doMercureFetch, doPublicMercureFetch]);

  useEffect(() => {
    scheduleRefreshRef.current = (tok: string) => {
      clearRefreshTimer();
      const exp = parseTokenExp(tok);
      if (!exp) return;
      const delay = exp * 1000 - Date.now() - 5 * 60 * 1000;
      if (delay <= 0) {
        void doSilentRefresh().then(async (newToken) => {
          if (newToken) {
            setToken(newToken);
            scheduleRefreshRef.current(newToken);
            void doMercureFetch();
            if (!userRef.current) {
              try {
                setUser(await fetchMe());
              } catch {
                /* non-fatal */
              }
            }
          }
        });
        return;
      }
      refreshTimerRef.current = setTimeout(() => {
        void doSilentRefresh().then(async (newToken) => {
          if (newToken) {
            setToken(newToken);
            scheduleRefreshRef.current(newToken);
            void doMercureFetch();
            if (!userRef.current) {
              try {
                setUser(await fetchMe());
              } catch {
                /* non-fatal */
              }
            }
          } else if (rateLimitedRef.current) {
            // Try again shortly instead of ending the session.
            refreshTimerRef.current = setTimeout(() => scheduleRefreshRef.current(tok), 60_000);
          } else {
            setToken(null);
            setUser(null);
            setSessionExpired(true);
          }
        });
      }, delay);
    };
  }, [clearRefreshTimer, doSilentRefresh, doMercureFetch, setToken]);

  useEffect(() => {
    const stored = getAccessToken();

    async function init() {
      // finishAuthRestore before any fetchMe — request() awaits this same gate.
      if (stored) {
        setToken(stored);
        finishAuthRestore();
        try {
          const me = await fetchMe();
          setUser(me);
          scheduleRefreshRef.current(stored);
          void doMercureFetch();
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            const newToken = await doSilentRefresh();
            if (newToken) {
              setToken(newToken);
              try {
                setUser(await fetchMe());
                scheduleRefreshRef.current(newToken);
                void doMercureFetch();
              } catch {
                setToken(null);
              }
            } else if (rateLimitedRef.current) {
              // Keep the stored token — it may well still be valid, and the
              // scheduled refresh retries once the limiter window clears.
              scheduleRefreshRef.current(stored);
              void doMercureFetch();
            } else {
              setToken(null);
            }
          } else {
            scheduleRefreshRef.current(stored);
            void doMercureFetch();
            void fetchMe()
              .then(setUser)
              .catch(() => {});
          }
        }
      } else if (localStorage.getItem(STORAGE_KEYS.HAD_SESSION) === "1") {
        const newToken = await doSilentRefresh();
        finishAuthRestore();
        if (newToken) {
          setToken(newToken);
          try {
            setUser(await fetchMe());
            scheduleRefreshRef.current(newToken);
            void doMercureFetch();
          } catch {
            setToken(null);
            void doPublicMercureFetch();
          }
        } else {
          void doPublicMercureFetch();
        }
      } else {
        void doPublicMercureFetch();
      }
      setIsLoading(false);
    }

    void init().finally(finishAuthRestore);
    return () => {
      clearRefreshTimer();
      clearMercureTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    (newToken: string) => {
      setToken(newToken);
      localStorage.setItem(STORAGE_KEYS.HAD_SESSION, "1");
      queryClient.clear();
      scheduleRefreshRef.current(newToken);
      void fetchMe()
        .then(setUser)
        .catch(() => {});
      void doMercureFetch();
    },
    [doMercureFetch, queryClient, setToken],
  );

  const logout = useCallback(async () => {
    clearRefreshTimer();
    clearMercureTimer();
    setMercureToken(null);
    setToken(null);
    setUser(null);
    setSessionExpired(false);
    localStorage.removeItem(STORAGE_KEYS.HAD_SESSION);
    queryClient.clear();
    void unsubscribeFromPush().catch(() => {});
    try {
      await revokeRefreshToken();
    } catch {
      /* ignore */
    }
    void doPublicMercureFetch();
  }, [clearRefreshTimer, clearMercureTimer, doPublicMercureFetch, queryClient, setToken]);

  useEffect(() => {
    function handleSessionExpired() {
      clearRefreshTimer();
      clearMercureTimer();
      setMercureToken(null);
      setToken(null);
      setUser(null);
      setSessionExpired(true);
      queryClient.clear();
      void unsubscribeFromPush().catch(() => {});
    }
    window.addEventListener("session:expired", handleSessionExpired);
    return () => window.removeEventListener("session:expired", handleSessionExpired);
  }, [clearRefreshTimer, clearMercureTimer, setToken, queryClient]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const me = await fetchMe();
    setUser(me);
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isLoading,
        login,
        logout,
        refreshUser,
        sessionExpired,
        mercureToken,
        refreshMercureToken: token ? doMercureFetch : doPublicMercureFetch,
        ensureMercureTopic,
      }}
    >
      {children}
      {sessionExpired && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl bg-overlay p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-semibold text-fg">Session expired</h2>
            <p className="mb-5 text-sm text-fg-muted">
              Your session has expired. Please log in again to continue.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setSessionExpired(false);
                  window.location.replace("/login");
                }}
                className="rounded-lg bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-[var(--accent-on)] transition hover:opacity-90"
              >
                Log in again
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}
