import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import {
  __resetRefreshStateForTests,
  loginAt,
  LoginRequestError,
  refreshAccessToken,
  refreshWithToken,
  setRefreshExecutor,
  verifyTwoFactorAt,
} from "@/api/auth";
import { setAccessToken } from "@/api/tokenStore";

const BASE = "https://other-server.example";

beforeEach(() => {
  __resetRefreshStateForTests();
  setAccessToken(null);
});
afterEach(() => {
  setRefreshExecutor(null);
  vi.unstubAllEnvs();
});

describe("loginAt", () => {
  it("returns access + refresh token from body", async () => {
    server.use(
      http.post(`${BASE}/auth`, () =>
        HttpResponse.json({ token: "jwt-a", refresh_token: "refresh-a" }),
      ),
    );
    const result = await loginAt(BASE, "a@b.c", "pw");
    expect(result).toEqual({
      token: "jwt-a",
      refreshToken: "refresh-a",
      twoFactorRequired: undefined,
    });
  });

  it("propagates twoFactorRequired with null refreshToken", async () => {
    server.use(
      http.post(`${BASE}/auth`, () =>
        HttpResponse.json({ token: "pending-jwt", twoFactorRequired: true }),
      ),
    );
    const result = await loginAt(BASE, "a@b.c", "pw");
    expect(result.twoFactorRequired).toBe(true);
    expect(result.refreshToken).toBeNull();
  });
});

describe("loginAt error classification", () => {
  it("classifies a network failure as unreachable with a null status", async () => {
    server.use(http.post(`${BASE}/auth`, () => HttpResponse.error()));
    await expect(loginAt(BASE, "a@b.c", "pw")).rejects.toMatchObject({
      kind: "unreachable",
      status: null,
    });
  });

  it("classifies a 401 response as auth", async () => {
    server.use(http.post(`${BASE}/auth`, () => new HttpResponse(null, { status: 401 })));
    await expect(loginAt(BASE, "a@b.c", "pw")).rejects.toMatchObject({
      kind: "auth",
      status: 401,
    });
  });

  it("classifies a 403 response as auth", async () => {
    server.use(http.post(`${BASE}/auth`, () => new HttpResponse(null, { status: 403 })));
    await expect(loginAt(BASE, "a@b.c", "pw")).rejects.toMatchObject({
      kind: "auth",
      status: 403,
    });
  });

  it("classifies a 429 response as unreachable with its status", async () => {
    server.use(http.post(`${BASE}/auth`, () => new HttpResponse(null, { status: 429 })));
    await expect(loginAt(BASE, "a@b.c", "pw")).rejects.toMatchObject({
      kind: "unreachable",
      status: 429,
    });
  });

  it("classifies a 503 response as unreachable with its status", async () => {
    server.use(http.post(`${BASE}/auth`, () => new HttpResponse(null, { status: 503 })));
    await expect(loginAt(BASE, "a@b.c", "pw")).rejects.toMatchObject({
      kind: "unreachable",
      status: 503,
    });
  });

  it("throws instances of LoginRequestError", async () => {
    server.use(http.post(`${BASE}/auth`, () => new HttpResponse(null, { status: 401 })));
    await expect(loginAt(BASE, "a@b.c", "pw")).rejects.toBeInstanceOf(LoginRequestError);
  });
});

describe("verifyTwoFactorAt", () => {
  it("sends pending token and returns both tokens", async () => {
    let sawAuth = "";
    server.use(
      http.post(`${BASE}/auth/2fa`, ({ request }) => {
        sawAuth = request.headers.get("Authorization") ?? "";
        return HttpResponse.json({ token: "jwt-b", refresh_token: "refresh-b" });
      }),
    );
    const result = await verifyTwoFactorAt(BASE, "pending-jwt", "123456");
    expect(sawAuth).toBe("Bearer pending-jwt");
    expect(result).toEqual({ token: "jwt-b", refreshToken: "refresh-b" });
  });
});

describe("refreshWithToken", () => {
  it("posts the refresh token in the body", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/token/refresh`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ token: "jwt-c", refresh_token: "refresh-c" });
      }),
    );
    const result = await refreshWithToken(BASE, "refresh-old");
    expect(body).toEqual({ refresh_token: "refresh-old" });
    expect(result).toEqual({ token: "jwt-c", refreshToken: "refresh-c" });
  });
});

describe("setRefreshExecutor", () => {
  it("routes refreshAccessToken through the executor and stores the token", async () => {
    setAccessToken("stale");
    setRefreshExecutor(async () => "fresh-jwt");
    const token = await refreshAccessToken();
    expect(token).toBe("fresh-jwt");
  });
});

describe("X-Token-Transport header", () => {
  it("is sent on loginAt in desktop mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    let seen: string | null = null;
    server.use(
      http.post(`${BASE}/auth`, ({ request }) => {
        seen = request.headers.get("X-Token-Transport");
        return HttpResponse.json({ token: "jwt-a", refresh_token: "refresh-a" });
      }),
    );
    await loginAt(BASE, "a@b.c", "pw");
    expect(seen).toBe("body");
  });

  it("is sent on verifyTwoFactorAt in desktop mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    let seen: string | null = null;
    server.use(
      http.post(`${BASE}/auth/2fa`, ({ request }) => {
        seen = request.headers.get("X-Token-Transport");
        return HttpResponse.json({ token: "jwt-b", refresh_token: "refresh-b" });
      }),
    );
    await verifyTwoFactorAt(BASE, "pending-jwt", "123456");
    expect(seen).toBe("body");
  });

  it("is sent on refreshWithToken in desktop mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    let seen: string | null = null;
    server.use(
      http.post(`${BASE}/token/refresh`, ({ request }) => {
        seen = request.headers.get("X-Token-Transport");
        return HttpResponse.json({ token: "jwt-c", refresh_token: "refresh-c" });
      }),
    );
    await refreshWithToken(BASE, "refresh-old");
    expect(seen).toBe("body");
  });

  it("is absent in web mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "");
    let seen: string | null = null;
    server.use(
      http.post(`${BASE}/auth`, ({ request }) => {
        seen = request.headers.get("X-Token-Transport");
        return HttpResponse.json({ token: "jwt-a", refresh_token: "refresh-a" });
      }),
    );
    await loginAt(BASE, "a@b.c", "pw");
    expect(seen).toBeNull();
  });
});
