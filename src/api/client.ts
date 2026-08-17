import i18n from "@/i18n";
import { authRestored, getAccessToken } from "@/api/tokenStore";
import type { AvatarMediaObject, LogoMediaObject } from "@/types/api";
import { getApiVersion } from "@/api/apiVersion";

const UNVERSIONED = /^\/api\/(versions|health|livekit\/|http-cache\/)/;

export function versionedPath(path: string): string {
  if (UNVERSIONED.test(path) || !/^\/api\/(?!v\d)/.test(path)) return path;
  return path.replace(/^\/api\//, `/api/${getApiVersion()}/`);
}

let _baseUrl = "";
export function configureApiClient(url: string): void {
  _baseUrl = url.replace(/\/$/, "");
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

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(
  url: string,
  method: Method = "GET",
  body?: unknown,
  isRetry = false,
  accept = "application/ld+json",
  contentType?: string,
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

  const response = await fetch(_baseUrl + versionedPath(url), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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
        const { isRefreshRateLimited } = await import("@/api/auth");
        // Rate-limited refreshes are transient — expiring the session here
        // would sign the user out over a burst of reloads.
        if (!isRefreshRateLimited(err)) {
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
