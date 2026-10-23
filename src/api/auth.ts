import {
  bootRequestTimeoutMs,
  fetchWithDeadline,
  RequestDeadlineError,
  requestTimeoutMs,
} from "@/api/fetchWithDeadline";
import { getAccessToken, setAccessToken } from "@/api/tokenStore";
import { getBaseUrl, ApiError } from "@/api/client";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { isManagedIdentityMode } from "@/platform/appMode";

function transportHeaders(): Record<string, string> {
  return isManagedIdentityMode() ? { "X-Token-Transport": "body" } : {};
}

export interface LoginResult {
  token: string;
  twoFactorRequired?: boolean;
}

export interface LoginTokens {
  token: string;
  refreshToken: string | null;
  twoFactorRequired?: boolean;
}

export class LoginRequestError extends Error {
  readonly kind: "auth" | "unreachable";
  readonly status: number | null;

  constructor(kind: "auth" | "unreachable", status: number | null) {
    super(kind);
    this.kind = kind;
    this.status = status;
  }
}

export async function loginAt(
  baseUrl: string,
  email: string,
  password: string,
  rememberMe = false,
): Promise<LoginTokens> {
  let response: Response;
  try {
    response = await fetchWithDeadline(
      baseUrl + "/auth",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...transportHeaders() },
        credentials: "include",
        body: JSON.stringify({ email, password, remember_me: rememberMe }),
      },
      requestTimeoutMs(),
    );
  } catch {
    throw new LoginRequestError("unreachable", null);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new LoginRequestError("auth", response.status);
    }
    throw new LoginRequestError("unreachable", response.status);
  }

  const data = (await response.json()) as {
    token: string;
    refresh_token?: string;
    twoFactorRequired?: boolean;
  };
  return {
    token: data.token,
    refreshToken: data.refresh_token ?? null,
    twoFactorRequired: data.twoFactorRequired,
  };
}

export async function login(
  email: string,
  password: string,
  rememberMe = false,
): Promise<LoginResult> {
  const { token, twoFactorRequired } = await loginAt(getBaseUrl(), email, password, rememberMe);
  return { token, twoFactorRequired };
}

export async function verifyTwoFactorAt(
  baseUrl: string,
  pendingToken: string,
  code: string,
  rememberMe = false,
): Promise<{ token: string; refreshToken: string | null }> {
  const response = await fetch(baseUrl + "/auth/2fa", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pendingToken}`,
      ...transportHeaders(),
    },
    credentials: "include",
    body: JSON.stringify({ code, remember_me: rememberMe }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.json().catch(() => null));
  }

  const data = (await response.json()) as { token: string; refresh_token?: string };
  return { token: data.token, refreshToken: data.refresh_token ?? null };
}

export async function verifyTwoFactorLogin(
  pendingToken: string,
  code: string,
  rememberMe = false,
): Promise<string> {
  const { token } = await verifyTwoFactorAt(getBaseUrl(), pendingToken, code, rememberMe);
  return token;
}

export async function refreshWithToken(
  baseUrl: string,
  refreshToken: string,
): Promise<{ token: string; refreshToken: string | null }> {
  const response = await fetchWithDeadline(
    baseUrl + "/token/refresh",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...transportHeaders() },
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
    bootRequestTimeoutMs(),
  );

  if (!response.ok) {
    throw new ApiError(response.status, await response.json().catch(() => null));
  }

  const data = (await response.json()) as { token: string; refresh_token?: string };
  return { token: data.token, refreshToken: data.refresh_token ?? null };
}

export class RefreshRateLimitedError extends Error {
  constructor() {
    super("refresh_rate_limited");
    this.name = "RefreshRateLimitedError";
  }
}

export class RefreshUnavailableError extends Error {
  constructor() {
    super("refresh_unavailable");
    this.name = "RefreshUnavailableError";
  }
}

export function isRefreshTransient(error: unknown): boolean {
  return (
    error instanceof RefreshRateLimitedError ||
    error instanceof RequestDeadlineError ||
    error instanceof RefreshUnavailableError
  );
}

function isServerUnavailable(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof ApiError && error.status >= 500) ||
    (error instanceof LoginRequestError && error.kind === "unreachable")
  );
}

let activeRefresh: Promise<string> | null = null;
let lastRefreshedAt = 0;
let lastFailedAt = 0;
let refreshExecutor: (() => Promise<string>) | null = null;

export function setRefreshExecutor(executor: (() => Promise<string>) | null): void {
  refreshExecutor = executor;
}

function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestDeadlineError()), timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

async function refreshViaCookie(): Promise<{ ok: true; newToken: string } | { ok: false }> {
  let res: Response;
  try {
    res = await fetchWithDeadline(
      getBaseUrl() + "/token/refresh",
      { method: "POST", credentials: "include" },
      requestTimeoutMs(),
    );
  } catch (err) {
    if (err instanceof TypeError) throw new RefreshUnavailableError();
    throw err;
  }
  if (res.status >= 500) {
    throw new RefreshUnavailableError();
  }
  // A rate-limited refresh says "ask again shortly", not "your session is
  // gone" — callers must keep the session and retry rather than sign out.
  if (res.status === 429) {
    throw new RefreshRateLimitedError();
  }
  if (!res.ok) {
    return { ok: false };
  }
  const { token: newToken } = (await res.json()) as { token: string };
  return { ok: true, newToken };
}

export function refreshAccessToken(): Promise<string> {
  if (activeRefresh) return activeRefresh;
  const token = getAccessToken();
  if (token && Date.now() - lastRefreshedAt < 10_000) {
    return Promise.resolve(token);
  }
  if (!token && Date.now() - lastFailedAt < 10_000) {
    return Promise.reject(new Error("refresh_failed"));
  }
  activeRefresh = (
    refreshExecutor
      ? withDeadline(refreshExecutor(), requestTimeoutMs() * 4)
          .then((newToken) => ({ ok: true, newToken }) as const)
          .catch((err: unknown) => {
            if (err instanceof ApiError && err.status === 429) {
              throw new RefreshRateLimitedError();
            }
            if (err instanceof RequestDeadlineError) throw err;
            if (isServerUnavailable(err)) throw new RefreshUnavailableError();
            return { ok: false } as const;
          })
      : refreshViaCookie()
  )
    .then((result) => {
      if (!result.ok) {
        lastFailedAt = Date.now();
        localStorage.removeItem(STORAGE_KEYS.HAD_SESSION);
        throw new Error("refresh_failed");
      }
      setAccessToken(result.newToken);
      lastRefreshedAt = Date.now();
      lastFailedAt = 0;
      localStorage.setItem(STORAGE_KEYS.HAD_SESSION, "1");
      return result.newToken;
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
