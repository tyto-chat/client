import i18n from "@/i18n";
import { authRestored, getAccessToken } from "@/api/tokenStore";
import type { AvatarMediaObject, LogoMediaObject } from "@/types/api";
import { getApiVersion } from "@/api/apiVersion";
import {
  bootRequestTimeoutMs,
  fetchWithDeadline,
  RequestDeadlineError,
  requestTimeoutMs,
} from "@/api/fetchWithDeadline";
import { recordNetworkFailure, recordNetworkSuccess } from "@/api/reachability";

const UNVERSIONED = /^\/api\/(versions|health|livekit\/|http-cache\/)/;

export function versionedPath(path: string): string {
  if (UNVERSIONED.test(path) || !/^\/api\/(?!v\d)/.test(path)) return path;
  return path.replace(/^\/api\//, `/api/${getApiVersion()}/`);
}

let _baseUrl = "";
export function configureApiClient(url: string): void {
  const next = url.replace(/\/$/, "");
  if (next !== _baseUrl) recordNetworkSuccess();
  _baseUrl = next;
}
export function getBaseUrl(): string {
  return _baseUrl;
}

export function avatarUrl(
  contentUrl: AvatarMediaObject["contentUrl"],
  size: keyof NonNullable<AvatarMediaObject["contentUrl"]> = "sm",
): string | null {
  return contentUrl?.[size] ?? null;
}

export function logoUrl(
  contentUrl: LogoMediaObject["contentUrl"],
  size: keyof NonNullable<LogoMediaObject["contentUrl"]> = "sm",
): string | null {
  return contentUrl?.[size] ?? null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

export class ApiTimeoutError extends Error {
  constructor() {
    super(i18n.t("request_timeout"));
    this.name = "ApiTimeoutError";
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(
  url: string,
  method: Method = "GET",
  body?: unknown,
  isRetry = false,
  accept = "application/ld+json",
  contentType?: string,
  timeoutMs = requestTimeoutMs(),
): Promise<T> {
  const requestBaseUrl = _baseUrl;
  await authRestored();
  const token = getAccessToken();

  const headers: Record<string, string> = {
    Accept: accept,
    "Accept-Language": i18n.language,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers["Content-Type"] =
      contentType ?? (method === "PATCH" ? "application/merge-patch+json" : "application/ld+json");
  }

  try {
    const result = await send<T>(
      url,
      method,
      body,
      isRetry,
      accept,
      contentType,
      headers,
      token,
      requestBaseUrl,
      timeoutMs,
    );
    if (requestBaseUrl === _baseUrl) recordNetworkSuccess();
    return result;
  } catch (caught) {
    const err = caught instanceof RequestDeadlineError ? new ApiTimeoutError() : caught;
    if (requestBaseUrl === _baseUrl) {
      if (isNetworkError(err)) recordNetworkFailure();
      else if (err instanceof ApiError) recordNetworkSuccess();
    }
    throw err;
  }
}

export async function probeServer(): Promise<void> {
  await request(
    "/api/server-info",
    "GET",
    undefined,
    false,
    "application/json",
    undefined,
    bootRequestTimeoutMs(),
  );
}

const GATEWAY_STATUSES = new Set([502, 503, 504]);

export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    error instanceof ApiTimeoutError ||
    (error instanceof ApiError && GATEWAY_STATUSES.has(error.status))
  );
}

async function send<T>(
  url: string,
  method: Method,
  body: unknown,
  isRetry: boolean,
  accept: string,
  contentType: string | undefined,
  headers: Record<string, string>,
  token: string | null,
  requestBaseUrl: string,
  timeoutMs: number,
): Promise<T> {
  const response = await fetchWithDeadline(
    _baseUrl + versionedPath(url),
    { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined },
    timeoutMs,
  );

  if (!response.ok) {
    let errorBody: unknown;
    try {
      const text = await response.text();
      try {
        errorBody = JSON.parse(text);
      } catch {
        errorBody = text;
      }
    } catch {
      errorBody = null;
    }

    const isDomain401 = errorBody !== null && typeof errorBody === "object" && "error" in errorBody;

    if (response.status === 401 && token && !isRetry && !isDomain401) {
      let refreshed = false;
      try {
        const { refreshAccessToken } = await import("@/api/auth");
        await refreshAccessToken();
        refreshed = true;
      } catch (err) {
        if (err instanceof RequestDeadlineError) throw err;
        const { isRefreshTransient } = await import("@/api/auth");
        // Rate-limited or timed-out refreshes are transient — expiring the
        // session here would sign the user out over a slow or busy server.
        if (!isRefreshTransient(err)) {
          window.dispatchEvent(new CustomEvent("session:expired"));
        }
      }
      if (refreshed && _baseUrl === requestBaseUrl) {
        return request<T>(url, method, body, true, accept, contentType);
      }
    }

    throw new ApiError(response.status, errorBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (text === "") {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export function isRateLimited(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429;
}

export function getApiErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body as {
    violations?: { message: string }[];
    error?: string;
    detail?: string;
    "hydra:description"?: string;
  } | null;
  return (
    body?.violations?.[0]?.message ??
    body?.error ??
    body?.detail ??
    body?.["hydra:description"] ??
    null
  );
}

export function apiErrorText(error: unknown, fallback: string): string {
  const fromBody = getApiErrorMessage(error);
  if (fromBody) return fromBody;
  if (error instanceof ApiError) return fallback;
  return error instanceof Error ? error.message : fallback;
}

export function uploadFile<T>(
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
  extraFields?: Record<string, string>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const token = getAccessToken();
    const formData = new FormData();
    formData.append("file", file);
    if (extraFields) {
      for (const [key, value] of Object.entries(extraFields)) {
        formData.append(key, value);
      }
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", _baseUrl + versionedPath(url));
    xhr.setRequestHeader("Accept", "application/ld+json");
    xhr.setRequestHeader("Accept-Language", i18n.language);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new ApiError(xhr.status, xhr.responseText));
        }
      } else {
        let body: unknown = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = xhr.responseText;
        }
        reject(new ApiError(xhr.status, body));
      }
    });

    xhr.addEventListener("error", () => reject(new ApiError(0, "Network error")));
    xhr.addEventListener("abort", () => reject(new ApiError(0, "Aborted")));

    xhr.send(formData);
  });
}

export const apiClient = {
  get: <T>(url: string) => request<T>(url, "GET"),
  getJson: <T>(url: string) => request<T>(url, "GET", undefined, false, "application/json"),
  post: <T>(url: string, body: unknown) => request<T>(url, "POST", body),
  postJson: <T>(url: string, body: unknown) =>
    request<T>(url, "POST", body, false, "application/json", "application/json"),
  put: <T>(url: string, body: unknown) => request<T>(url, "PUT", body),
  putJson: <T>(url: string, body: unknown) =>
    request<T>(url, "PUT", body, false, "application/json", "application/json"),
  patch: <T>(url: string, body: unknown) => request<T>(url, "PATCH", body),
  patchJson: <T>(url: string, body: unknown) =>
    request<T>(url, "PATCH", body, false, "application/json", "application/json"),
  delete: <T>(url: string) => request<T>(url, "DELETE"),
  deleteJson: <T>(url: string, body: unknown) =>
    request<T>(url, "DELETE", body, false, "application/json", "application/json"),
};
