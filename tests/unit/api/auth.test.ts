import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import {
  login,
  verifyTwoFactorLogin,
  refreshAccessToken,
  revokeRefreshToken,
  __resetRefreshStateForTests,
  isRefreshRateLimited,
  setRefreshExecutor,
  LoginRequestError,
} from "@/api/auth";
import { ApiError, configureApiClient } from "@/api/client";
import { getAccessToken, setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken(null);
  __resetRefreshStateForTests();
  setRefreshExecutor(null);
});

describe("login", () => {
  it("returns the token from the response", async () => {
    server.use(http.post(`${BASE}/auth`, () => HttpResponse.json({ token: "jwt-abc" })));
    const result = await login("user@example.com", "password");
    expect(result.token).toBe("jwt-abc");
  });

  it("throws a LoginRequestError classifying a 401 as auth", async () => {
    server.use(
      http.post(`${BASE}/auth`, () =>
        HttpResponse.json({ message: "Invalid credentials" }, { status: 401 }),
      ),
    );
    await expect(login("bad@example.com", "wrong")).rejects.toMatchObject({
      kind: "auth",
      status: 401,
    });
    await expect(login("bad@example.com", "wrong")).rejects.toBeInstanceOf(LoginRequestError);
  });
});

describe("hadSession flag", () => {
  it("is set on a successful refresh and cleared on a failed one", async () => {
    server.use(http.post(`${BASE}/token/refresh`, () => HttpResponse.json({ token: "jwt-new" })));
    await refreshAccessToken();
    expect(localStorage.getItem("hadSession")).toBe("1");

    __resetRefreshStateForTests();
    setAccessToken(null);
    server.use(http.post(`${BASE}/token/refresh`, () => HttpResponse.json({}, { status: 401 })));
    await expect(refreshAccessToken()).rejects.toThrow("refresh_failed");
    expect(localStorage.getItem("hadSession")).toBeNull();
  });
});

describe("refreshAccessToken", () => {
  it("stores the new token in the token store and returns it", async () => {
    server.use(http.post(`${BASE}/token/refresh`, () => HttpResponse.json({ token: "new-token" })));
    const token = await refreshAccessToken();
    expect(token).toBe("new-token");
    expect(getAccessToken()).toBe("new-token");
  });

  it("throws on refresh failure", async () => {
    server.use(http.post(`${BASE}/token/refresh`, () => new HttpResponse(null, { status: 401 })));
    await expect(refreshAccessToken()).rejects.toThrow("refresh_failed");
  });

  it("deduplicates concurrent refresh calls (shares one in-flight request)", async () => {
    let requestCount = 0;

    server.use(
      http.post(`${BASE}/token/refresh`, async () => {
        requestCount++;
        await new Promise((r) => setTimeout(r, 10));
        return HttpResponse.json({ token: "dedup-token" });
      }),
    );

    const [a, b, c] = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(requestCount).toBe(1);
    expect(a).toBe("dedup-token");
    expect(b).toBe("dedup-token");
    expect(c).toBe("dedup-token");
  });

  it("flags a rate-limited refresh as transient, not a dead session", async () => {
    server.use(http.post(`${BASE}/token/refresh`, () => new HttpResponse(null, { status: 429 })));

    await expect(refreshAccessToken()).rejects.toSatisfy(isRefreshRateLimited);
  });

  it("does not flag other failures as rate limited", async () => {
    server.use(http.post(`${BASE}/token/refresh`, () => new HttpResponse(null, { status: 401 })));

    await expect(refreshAccessToken()).rejects.not.toSatisfy(isRefreshRateLimited);
  });

  it("keeps a previously stored token after a 429", async () => {
    setAccessToken("still-valid");
    server.use(http.post(`${BASE}/token/refresh`, () => new HttpResponse(null, { status: 429 })));

    await expect(refreshAccessToken()).rejects.toThrow();
    expect(getAccessToken()).toBe("still-valid");
  });
});

describe("refreshAccessToken via executor", () => {
  it("throttles after an executor rejection without re-invoking the executor", async () => {
    let calls = 0;
    setRefreshExecutor(async () => {
      calls++;
      throw new Error("network down");
    });

    await expect(refreshAccessToken()).rejects.toThrow("refresh_failed");
    expect(calls).toBe(1);
    expect(localStorage.getItem("hadSession")).toBeNull();

    await expect(refreshAccessToken()).rejects.toThrow("refresh_failed");
    expect(calls).toBe(1);
  });

  it("maps a 429 ApiError from the executor to RefreshRateLimitedError and preserves the session", async () => {
    setAccessToken("still-valid");
    setRefreshExecutor(async () => {
      throw new ApiError(429, null);
    });

    await expect(refreshAccessToken()).rejects.toSatisfy(isRefreshRateLimited);
    expect(getAccessToken()).toBe("still-valid");
  });
});

describe("revokeRefreshToken", () => {
  it("calls /logout and resolves", async () => {
    let called = false;
    server.use(
      http.post(`${BASE}/logout`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(revokeRefreshToken()).resolves.toBeUndefined();
    expect(called).toBe(true);
  });
});

describe("two-factor login", () => {
  it("surfaces twoFactorRequired from /auth", async () => {
    server.use(
      http.post(`${BASE}/auth`, () =>
        HttpResponse.json({ twoFactorRequired: true, token: "pending-jwt" }),
      ),
    );
    const result = await login("totp@example.com", "password");
    expect(result.twoFactorRequired).toBe(true);
    expect(result.token).toBe("pending-jwt");
  });

  it("verifyTwoFactorLogin exchanges code for a full token", async () => {
    server.use(
      http.post(`${BASE}/auth/2fa`, ({ request }) => {
        if (request.headers.get("Authorization") !== "Bearer pending-jwt") {
          return HttpResponse.json({}, { status: 401 });
        }
        return HttpResponse.json({ token: "full-jwt" });
      }),
    );
    const token = await verifyTwoFactorLogin("pending-jwt", "123456");
    expect(token).toBe("full-jwt");
  });
});
