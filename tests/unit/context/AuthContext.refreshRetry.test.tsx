import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { configureApiClient } from "@/api/client";
import { __resetRefreshStateForTests } from "@/api/auth";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";

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
});
