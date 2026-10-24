import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { configureApiClient } from "@/api/client";
import { __resetRefreshStateForTests } from "@/api/auth";
import { getAccessToken, setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { STORAGE_KEYS } from "@/utils/storageKeys";

function tokenExpiringIn(seconds: number, marker: string): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds, m: marker }));
  return `${header}.${payload}.sig`;
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("AuthContext silent refresh retries", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    configureApiClient(BASE);
    __resetRefreshStateForTests();
    server.use(
      http.get(`${BASE}/api/v1/me`, () => HttpResponse.json(mockUser)),
      http.get(`${BASE}/api/v1/realtime/token`, () =>
        HttpResponse.json({ token: "rt", expiresAt: Math.floor(Date.now() / 1000) + 600 }),
      ),
    );
  });

  afterEach(() => {
    setAccessToken(null);
    localStorage.clear();
    __resetRefreshStateForTests();
    vi.useRealTimers();
  });

  it("keeps retrying a near-expiry refresh after repeated transient failures", async () => {
    const fresh = tokenExpiringIn(3600, "fresh");
    const replies = [429, 429];
    let calls = 0;
    server.use(
      http.post(`${BASE}/token/refresh`, () => {
        calls += 1;
        const status = replies.shift();
        if (status) return new HttpResponse(null, { status });
        return HttpResponse.json({ token: fresh });
      }),
    );
    setAccessToken(tokenExpiringIn(120, "old"));

    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(calls).toBe(1));

    for (let i = 0; i < 3 && result.current.token !== fresh; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000);
      });
    }

    expect(calls).toBe(3);
    expect(result.current.token).toBe(fresh);
  });

  it("keeps retrying the cookie restore of a returning user after a transient failure", async () => {
    const fresh = tokenExpiringIn(3600, "restored");
    const replies = [429];
    let calls = 0;
    server.use(
      http.post(`${BASE}/token/refresh`, () => {
        calls += 1;
        const status = replies.shift();
        if (status) return new HttpResponse(null, { status });
        return HttpResponse.json({ token: fresh });
      }),
    );
    localStorage.setItem(STORAGE_KEYS.HAD_SESSION, "1");

    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(calls).toBe(1));
    expect(result.current.token).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    await waitFor(() => expect(result.current.token).toBe(fresh));
    expect(calls).toBe(2);
  });

  it("ends the session when a scheduled refresh fails for good", async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/token/refresh`, () => {
        calls += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );
    setAccessToken(tokenExpiringIn(5 * 60 + 2, "old"));

    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => expect(result.current.token).toBeNull());
    expect(calls).toBe(1);
  });

  it("drops a background restore that finishes after the user logged in", async () => {
    const restored = tokenExpiringIn(3600, "restored");
    const newer = tokenExpiringIn(3600, "newer");
    let release: () => void = () => {};
    let calls = 0;
    server.use(
      http.post(`${BASE}/token/refresh`, async () => {
        calls += 1;
        if (calls === 1) return new HttpResponse(null, { status: 429 });
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json({ token: restored });
      }),
    );
    localStorage.setItem(STORAGE_KEYS.HAD_SESSION, "1");

    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    await waitFor(() => expect(calls).toBe(2));

    act(() => result.current.login(newer));
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.token).toBe(newer);
    expect(getAccessToken()).toBe(newer);
  });

  it("ends the session when a retried refresh then fails for good", async () => {
    let expiredEvents = 0;
    const onExpired = () => {
      expiredEvents += 1;
    };
    window.addEventListener("session:expired", onExpired);
    onTestFinished(() => window.removeEventListener("session:expired", onExpired));
    const replies = [429, 401];
    server.use(
      http.post(
        `${BASE}/token/refresh`,
        () => new HttpResponse(null, { status: replies.shift() ?? 401 }),
      ),
    );
    setAccessToken(tokenExpiringIn(120, "old"));

    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    await waitFor(() => expect(result.current.token).toBeNull());
    expect(result.current.sessionExpired).toBe(true);
    expect(result.current.mercureToken).toBeNull();
    expect(expiredEvents).toBe(1);
  });

  it("drops a scheduled refresh that finishes after the user logged in", async () => {
    const stale = tokenExpiringIn(3600, "stale");
    const newer = tokenExpiringIn(3600, "newer");
    let release: () => void = () => {};
    let calls = 0;
    server.use(
      http.post(`${BASE}/token/refresh`, async () => {
        calls += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json({ token: stale });
      }),
    );
    setAccessToken(tokenExpiringIn(120, "old"));

    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(calls).toBe(1));

    act(() => result.current.login(newer));
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.token).toBe(newer);
    expect(getAccessToken()).toBe(newer);
  });
});
