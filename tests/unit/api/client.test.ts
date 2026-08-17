import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { apiClient, ApiError, configureApiClient, getApiErrorMessage } from "@/api/client";
import { __resetRefreshStateForTests } from "@/api/auth";
import { getAccessToken, setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken(null);
  __resetRefreshStateForTests();
});

describe("apiClient.get", () => {
  it("sends GET request and returns JSON", async () => {
    server.use(http.get(`${BASE}/api/v1/test`, () => HttpResponse.json({ ok: true })));
    const result = await apiClient.get<{ ok: boolean }>("/api/test");
    expect(result).toEqual({ ok: true });
  });

  it("sets Authorization header when a token is present", async () => {
    setAccessToken("my-token");
    let capturedAuth: string | null = null;

    server.use(
      http.get(`${BASE}/api/v1/me`, ({ request }) => {
        capturedAuth = request.headers.get("Authorization");
        return HttpResponse.json({ id: 1 });
      }),
    );

    await apiClient.get("/api/me");
    expect(capturedAuth).toBe("Bearer my-token");
  });

  it("omits Authorization header when no token", async () => {
    let capturedAuth: string | null = "present";

    server.use(
      http.get(`${BASE}/api/v1/public`, ({ request }) => {
        capturedAuth = request.headers.get("Authorization");
        return HttpResponse.json({});
      }),
    );

    await apiClient.get("/api/public");
    expect(capturedAuth).toBeNull();
  });

  it("throws ApiError on non-ok response", async () => {
    server.use(
      http.get(`${BASE}/api/v1/forbidden`, () =>
        HttpResponse.json({ detail: "Access denied" }, { status: 403 }),
      ),
    );

    await expect(apiClient.get("/api/forbidden")).rejects.toBeInstanceOf(ApiError);
  });

  it("ApiError carries status and body", async () => {
    server.use(
      http.get(`${BASE}/api/v1/notfound`, () =>
        HttpResponse.json({ "hydra:description": "Not found" }, { status: 404 }),
      ),
    );

    let caught: ApiError | null = null;
    try {
      await apiClient.get("/api/notfound");
    } catch (e) {
      caught = e as ApiError;
    }

    expect(caught?.status).toBe(404);
    expect(caught?.body).toMatchObject({ "hydra:description": "Not found" });
  });

  it("returns undefined for 204 responses", async () => {
    server.use(http.delete(`${BASE}/api/v1/item/1`, () => new HttpResponse(null, { status: 204 })));
    const result = await apiClient.delete("/api/item/1");
    expect(result).toBeUndefined();
  });
});

describe("apiClient — 401 auto-refresh", () => {
  it("retries request after refreshing token on 401", async () => {
    setAccessToken("expired-token");
    let callCount = 0;

    server.use(
      http.get(`${BASE}/api/v1/protected`, () => {
        callCount++;
        if (callCount === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ data: "secret" });
      }),
      http.post(`${BASE}/token/refresh`, () => HttpResponse.json({ token: "new-token" })),
    );

    const result = await apiClient.get<{ data: string }>("/api/protected");
    expect(result).toEqual({ data: "secret" });
    expect(callCount).toBe(2);
    expect(getAccessToken()).toBe("new-token");
  });

  it("dispatches session:expired when retry also fails", async () => {
    setAccessToken("bad-token");

    server.use(
      http.get(`${BASE}/api/v1/protected`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${BASE}/token/refresh`, () => new HttpResponse(null, { status: 401 })),
    );

    const events: Event[] = [];
    const handler = (e: Event) => events.push(e);
    window.addEventListener("session:expired", handler);

    try {
      await apiClient.get("/api/protected");
    } catch {
      // expected to throw
    } finally {
      window.removeEventListener("session:expired", handler);
    }

    expect(events).toHaveLength(1);
  });

  it("does not dispatch session:expired when the refresh is rate limited", async () => {
    setAccessToken("valid-token");

    server.use(
      http.get(`${BASE}/api/v1/protected`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${BASE}/token/refresh`, () => new HttpResponse(null, { status: 429 })),
    );

    const events: Event[] = [];
    const handler = (e: Event) => events.push(e);
    window.addEventListener("session:expired", handler);

    try {
      await apiClient.get("/api/protected");
    } catch {
      // the request itself still fails; the session must survive
    } finally {
      window.removeEventListener("session:expired", handler);
    }

    expect(events).toHaveLength(0);
    expect(getAccessToken()).toBe("valid-token");
  });

  it("does not retry or dispatch session:expired for a domain 401 with an error body", async () => {
    setAccessToken("pending-token");
    let callCount = 0;
    let refreshCallCount = 0;

    server.use(
      http.post(`${BASE}/api/v1/auth/2fa`, () => {
        callCount++;
        return HttpResponse.json({ error: "Invalid two-factor code." }, { status: 401 });
      }),
      http.post(`${BASE}/token/refresh`, () => {
        refreshCallCount++;
        return HttpResponse.json({ token: "new-token" });
      }),
    );

    const events: Event[] = [];
    const handler = (e: Event) => events.push(e);
    window.addEventListener("session:expired", handler);

    let caught: ApiError | null = null;
    try {
      await apiClient.post("/api/auth/2fa", { code: "000000" });
    } catch (e) {
      caught = e as ApiError;
    } finally {
      window.removeEventListener("session:expired", handler);
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(401);
    expect(callCount).toBe(1);
    expect(refreshCallCount).toBe(0);
    expect(events).toHaveLength(0);
  });

  it("still retries a 401 whose body has no error key", async () => {
    setAccessToken("expired-token");
    let callCount = 0;

    server.use(
      http.get(`${BASE}/api/v1/protected`, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({ code: 401, message: "Expired JWT Token" }, { status: 401 });
        }
        return HttpResponse.json({ data: "secret" });
      }),
      http.post(`${BASE}/token/refresh`, () => HttpResponse.json({ token: "new-token" })),
    );

    const result = await apiClient.get<{ data: string }>("/api/protected");
    expect(result).toEqual({ data: "secret" });
    expect(callCount).toBe(2);
  });

  it("skips the retry when the base URL changes between request start and the refresh completing", async () => {
    setAccessToken("expired-token");
    let protectedCallCount = 0;
    let refreshCallCount = 0;
    const OTHER_BASE = "https://other.example/api";

    server.use(
      http.get(`${BASE}/api/v1/protected`, () => {
        protectedCallCount++;
        return new HttpResponse(null, { status: 401 });
      }),
      http.post(`${BASE}/token/refresh`, () => {
        refreshCallCount++;
        configureApiClient(OTHER_BASE);
        return HttpResponse.json({ token: "new-token" });
      }),
    );

    let caught: ApiError | null = null;
    try {
      await apiClient.get("/api/protected");
    } catch (e) {
      caught = e as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(401);
    expect(protectedCallCount).toBe(1);
    expect(refreshCallCount).toBe(1);

    configureApiClient(BASE);
  });
});

describe("apiClient.post / patch", () => {
  it("sends POST with application/ld+json content-type", async () => {
    let contentType: string | null = null;

    server.use(
      http.post(`${BASE}/api/v1/messages`, ({ request }) => {
        contentType = request.headers.get("Content-Type");
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    await apiClient.post("/api/messages", { text: "hello" });
    expect(contentType).toBe("application/ld+json");
  });

  it("sends PATCH with application/merge-patch+json", async () => {
    let contentType: string | null = null;

    server.use(
      http.patch(`${BASE}/api/v1/profiles/1`, ({ request }) => {
        contentType = request.headers.get("Content-Type");
        return HttpResponse.json({ id: 1 });
      }),
    );

    await apiClient.patch("/api/profiles/1", { displayName: "New" });
    expect(contentType).toBe("application/merge-patch+json");
  });
});

describe("getApiErrorMessage", () => {
  it("extracts violations[0].message", () => {
    const err = new ApiError(422, { violations: [{ message: "Field required" }] });
    expect(getApiErrorMessage(err)).toBe("Field required");
  });

  it("extracts detail when no violations", () => {
    const err = new ApiError(400, { detail: "Bad request" });
    expect(getApiErrorMessage(err)).toBe("Bad request");
  });

  it("extracts hydra:description", () => {
    const err = new ApiError(403, { "hydra:description": "Access denied" });
    expect(getApiErrorMessage(err)).toBe("Access denied");
  });

  it("returns null for non-ApiError", () => {
    expect(getApiErrorMessage(new Error("plain"))).toBeNull();
  });

  it("returns null for ApiError with no body", () => {
    expect(getApiErrorMessage(new ApiError(500, null))).toBeNull();
  });
});
