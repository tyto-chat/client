import { getAccessToken, setAccessToken } from "@/api/tokenStore";
import { getBaseUrl, ApiError } from "@/api/client";
import { STORAGE_KEYS } from "@/utils/storageKeys";

export interface LoginResult {
  token: string;
  twoFactorRequired?: boolean;
}

export async function login(
  email: string,
  password: string,
  rememberMe = false,
): Promise<LoginResult> {
  const response = await fetch(getBaseUrl() + "/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, remember_me: rememberMe }),
  });

  if (!response.ok) {
    throw new Error("Invalid credentials");
  }

  return (await response.json()) as LoginResult;
}

export async function verifyTwoFactorLogin(
  pendingToken: string,
  code: string,
  rememberMe = false,
): Promise<string> {
  const response = await fetch(getBaseUrl() + "/auth/2fa", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${pendingToken}` },
    credentials: "include",
    body: JSON.stringify({ code, remember_me: rememberMe }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.json().catch(() => null));
  }

  const data = (await response.json()) as { token: string };
  return data.token;
}

export class RefreshRateLimitedError extends Error {
  constructor() {
    super("refresh_rate_limited");
    this.name = "RefreshRateLimitedError";
  }
}

export function isRefreshRateLimited(error: unknown): boolean {
  return error instanceof RefreshRateLimitedError;
}

let activeRefresh: Promise<string> | null = null;
let lastRefreshedAt = 0;
let lastFailedAt = 0;

export function refreshAccessToken(): Promise<string> {
  if (activeRefresh) return activeRefresh;
  const token = getAccessToken();
  if (token && Date.now() - lastRefreshedAt < 10_000) {
    return Promise.resolve(token);
  }
  if (!token && Date.now() - lastFailedAt < 10_000) {
    return Promise.reject(new Error("refresh_failed"));
  }
  activeRefresh = fetch(getBaseUrl() + "/token/refresh", { method: "POST", credentials: "include" })
    .then(async (res) => {
      // A rate-limited refresh says "ask again shortly", not "your session is
      // gone" — callers must keep the session and retry rather than sign out.
      if (res.status === 429) {
        throw new RefreshRateLimitedError();
      }
      if (!res.ok) {
        lastFailedAt = Date.now();
        localStorage.removeItem(STORAGE_KEYS.HAD_SESSION);
        throw new Error("refresh_failed");
      }
      const { token: newToken } = (await res.json()) as { token: string };
      setAccessToken(newToken);
      lastRefreshedAt = Date.now();
      lastFailedAt = 0;
      localStorage.setItem(STORAGE_KEYS.HAD_SESSION, "1");
      return newToken;
    })
    .finally(() => {
      activeRefresh = null;
    });
  return activeRefresh;
}

export function __resetRefreshStateForTests(): void {
  activeRefresh = null;
  lastRefreshedAt = 0;
  lastFailedAt = 0;
}

export async function revokeRefreshToken(): Promise<void> {
  await fetch(getBaseUrl() + "/logout", {
    method: "POST",
    credentials: "include",
  });
}
