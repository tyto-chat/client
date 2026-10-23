/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchMe } from "@/api/users";
import {
  isRefreshTransient,
  refreshAccessToken,
  revokeRefreshToken,
  setRefreshExecutor,
} from "@/api/auth";
import { ApiError, getBaseUrl } from "@/api/client";
import { finishAuthRestore, getAccessToken, setAccessToken } from "@/api/tokenStore";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { decodeJwtPayload } from "@/utils/jwtPayload";
import type { RealtimeScope } from "@/api/realtimeToken";
import {
  realtimeRefreshDelay,
  realtimeRetryDelay,
  type RealtimeTokenExpiry,
} from "@/utils/realtimeSchedule";
import { unsubscribeFromPush } from "@/utils/webPush";
import { isManagedIdentityMode } from "@/platform/appMode";
import { getActiveIdentityKey, subscribeActiveIdentity } from "@/platform/activeIdentity";
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
  mercureTokenRevokesGrants: boolean;
  mercureSuspended: boolean;
  refreshMercureToken: (options?: { revoke?: boolean }) => Promise<void>;
  setRealtimeScope: (scope: RealtimeScope) => void;
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
  const [mercureTokenRevokesGrants, setMercureTokenRevokesGrants] = useState(false);
  const [mercureSuspended, setMercureSuspended] = useState(false);
  const revokeRequestedAtRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mercureRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef<User | null>(null);
  const realtimeScopeRef = useRef<RealtimeScope>({});
  const mercureRequestRef = useRef(0);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

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

  // Distinguishes "session is gone" from "ask again shortly": a rate-limited or
  // timed-out refresh must leave the current session alone.
  const transientRefreshRef = useRef(false);

  const doSilentRefresh = useCallback(async (): Promise<string | null> => {
    try {
      const refreshed = await refreshAccessToken();
      transientRefreshRef.current = false;
      return refreshed;
    } catch (err) {
      transientRefreshRef.current = isRefreshTransient(err);
      return null;
    }
  }, []);

  const mercureFailuresRef = useRef(0);
  const mercureDueAtRef = useRef<number | null>(null);

  const mintMercureToken = useCallback(
    async (
      mint: (scope: RealtimeScope) => Promise<{ token: string | null } & RealtimeTokenExpiry>,
    ) => {
      const request = ++mercureRequestRef.current;
      try {
        const minted = await mint(realtimeScopeRef.current);
        const mToken = minted.token;
        if (request !== mercureRequestRef.current) return;
        mercureFailuresRef.current = 0;
        const revokedAt = revokeRequestedAtRef.current;
        if (revokedAt !== null && request <= revokedAt) return;
        setMercureTokenRevokesGrants(revokedAt !== null);
        revokeRequestedAtRef.current = null;
        setMercureSuspended(false);
        setMercureToken(mToken);
        clearMercureTimer();
        if (!mToken) {
          mercureDueAtRef.current = null;
          return;
        }
        const delay = realtimeRefreshDelay(minted);
        mercureDueAtRef.current = Date.now() + delay;
        mercureRefreshTimerRef.current = setTimeout(() => void mercureScheduleRef.current(), delay);
      } catch (err) {
        if (request !== mercureRequestRef.current) return;
        clearMercureTimer();
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          const scope = realtimeScopeRef.current;
          if (err.status === 403 && (scope.community || scope.conversation)) {
            realtimeScopeRef.current = {};
            void mercureScheduleRef.current();
            return;
          }
          mercureFailuresRef.current = 0;
          mercureDueAtRef.current = null;
          revokeRequestedAtRef.current = null;
          setMercureSuspended(false);
          setMercureToken(null);
          return;
        }
        const delay = realtimeRetryDelay(mercureFailuresRef.current);
        mercureFailuresRef.current += 1;
        mercureDueAtRef.current = Date.now() + delay;
        mercureRefreshTimerRef.current = setTimeout(() => void mercureScheduleRef.current(), delay);
      }
    },
    [clearMercureTimer],
  );

  const doMercureFetch = useCallback(
    () =>
      mintMercureToken(async (scope) => {
        const { fetchRealtimeToken } = await import("@/api/realtimeToken");
        return fetchRealtimeToken(scope);
      }),
    [mintMercureToken],
  );

  const doPublicMercureFetch = useCallback(
    () =>
      mintMercureToken(async (scope) => {
        const { fetchPublicRealtimeToken } = await import("@/api/realtimeToken");
        return fetchPublicRealtimeToken(scope);
      }),
    [mintMercureToken],
  );

  useEffect(() => {
    const remintIfDue = () => {
      const dueAt = mercureDueAtRef.current;
      if (dueAt === null || Date.now() < dueAt) return;
      void mercureScheduleRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") remintIfDue();
    };
    const onOnline = () => {
      if (mercureDueAtRef.current !== null && mercureFailuresRef.current > 0) {
        void mercureScheduleRef.current();
        return;
      }
      remintIfDue();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const mercureRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const mercureRefreshAgainRef = useRef(false);

  const refreshMercureToken = useCallback((options?: { revoke?: boolean }): Promise<void> => {
    if (options?.revoke) {
      revokeRequestedAtRef.current = mercureRequestRef.current;
      setMercureSuspended(true);
    }
    if (mercureRefreshInFlightRef.current) {
      mercureRefreshAgainRef.current = true;
      return mercureRefreshInFlightRef.current;
    }
    const run = async () => {
      do {
        mercureRefreshAgainRef.current = false;
        await mercureScheduleRef.current();
      } while (mercureRefreshAgainRef.current);
    };
    const inFlight = run().finally(() => {
      mercureRefreshInFlightRef.current = null;
    });
    mercureRefreshInFlightRef.current = inFlight;
    return inFlight;
  }, []);

  const setRealtimeScope = useCallback((scope: RealtimeScope) => {
    const current = realtimeScopeRef.current;
    if (current.community === scope.community && current.conversation === scope.conversation)
      return;
    realtimeScopeRef.current = scope;
    void mercureScheduleRef.current();
  }, []);

  useEffect(() => {
    mercureScheduleRef.current = token ? doMercureFetch : doPublicMercureFetch;
  }, [token, doMercureFetch, doPublicMercureFetch]);

  useEffect(() => {
    scheduleRefreshRef.current = (tok: string) => {
      clearRefreshTimer();
      const exp = parseTokenExp(tok);
      if (!exp) return;
      const refresh = (endSessionOnFailure: boolean) =>
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
          } else if (transientRefreshRef.current) {
            // Try again shortly instead of ending the session.
            refreshTimerRef.current = setTimeout(() => scheduleRefreshRef.current(tok), 60_000);
          } else if (endSessionOnFailure) {
            setToken(null);
            setUser(null);
            setSessionExpired(true);
          }
        });
      const delay = exp * 1000 - Date.now() - 5 * 60 * 1000;
      if (delay <= 0) {
        refresh(false);
        return;
      }
      refreshTimerRef.current = setTimeout(() => refresh(true), delay);
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
            } else if (transientRefreshRef.current) {
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

  const activeIdentityKey = useSyncExternalStore(subscribeActiveIdentity, getActiveIdentityKey);
  const previousIdentityKeyRef = useRef(activeIdentityKey);

  useEffect(() => {
    if (activeIdentityKey === previousIdentityKeyRef.current) return;
    previousIdentityKeyRef.current = activeIdentityKey;
    if (!activeIdentityKey) return;

    queueMicrotask(() => {
      if (getActiveIdentityKey() !== activeIdentityKey) return;
      clearRefreshTimer();
      clearMercureTimer();
      setSessionExpired(false);
      mercureRequestRef.current += 1;
      revokeRequestedAtRef.current = null;
      setMercureSuspended(false);
      setMercureToken(null);
      mercureDueAtRef.current = null;
      const switched = getAccessToken();
      setTokenState(switched);
      if (switched) {
        scheduleRefreshRef.current(switched);
        void fetchMe()
          .then(setUser)
          .catch(() => {});
        void doMercureFetch();
      } else {
        setUser(null);
        void doPublicMercureFetch();
      }
    });
  }, [
    activeIdentityKey,
    clearRefreshTimer,
    clearMercureTimer,
    doMercureFetch,
    doPublicMercureFetch,
  ]);

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
    if (isManagedIdentityMode()) {
      try {
        const { getPlatformBridge } = await import("@/platform/bridge");
        const { loadDesktopConfig, saveDesktopConfig, setIdentityKind } =
          await import("@/desktop/desktopConfig");
        const { revokeAndWipeSecrets } = await import("@/desktop/identityLifecycle");
        const bridge = getPlatformBridge();
        const config = await loadDesktopConfig(bridge);
        const profileId = config.lastActiveProfileId ?? config.profiles[0]?.id ?? null;
        const profile = profileId ? config.profiles.find((p) => p.id === profileId) : undefined;
        const identityId = profile
          ? (profile.lastActiveIdentityId ?? profile.identities[0]?.id ?? null)
          : null;
        if (profileId && identityId) {
          await revokeAndWipeSecrets(bridge, getBaseUrl(), profileId, identityId);
          await saveDesktopConfig(bridge, setIdentityKind(config, profileId, identityId, "guest"));
        }
      } catch {
        /* best-effort: local session teardown below still proceeds */
      }
      setRefreshExecutor(null);
    }

    clearRefreshTimer();
    clearMercureTimer();
    mercureRequestRef.current += 1;
    revokeRequestedAtRef.current = null;
    setMercureSuspended(false);
    setMercureToken(null);
    mercureDueAtRef.current = null;
    setToken(null);
    setUser(null);
    setSessionExpired(false);
    localStorage.removeItem(STORAGE_KEYS.HAD_SESSION);
    queryClient.clear();
    void unsubscribeFromPush().catch(() => {});
    if (!isManagedIdentityMode()) {
      try {
        await revokeRefreshToken();
      } catch {
        /* ignore */
      }
    }
    void doPublicMercureFetch();

    if (isManagedIdentityMode()) {
      window.location.replace("/");
    }
  }, [clearRefreshTimer, clearMercureTimer, doPublicMercureFetch, queryClient, setToken]);

  useEffect(() => {
    function handleSessionExpired() {
      clearRefreshTimer();
      clearMercureTimer();
      mercureRequestRef.current += 1;
      revokeRequestedAtRef.current = null;
      setMercureSuspended(false);
      setMercureToken(null);
      mercureDueAtRef.current = null;
      setToken(null);
      setUser(null);
      queryClient.clear();
      void unsubscribeFromPush().catch(() => {});
      if (isManagedIdentityMode()) {
        window.location.replace("/");
        return;
      }
      setSessionExpired(true);
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
        mercureTokenRevokesGrants,
        mercureSuspended,
        refreshMercureToken,
        setRealtimeScope,
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
                  window.location.replace(isManagedIdentityMode() ? "/" : "/login");
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

export function useOptionalAuthContext(): AuthState | null {
  return useContext(AuthContext);
}
