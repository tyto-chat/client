import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { setActiveIdentityKey } from "@/platform/activeIdentity";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";

function makeToken(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(JSON.stringify({ exp }));
  return `${header}.${payload}.sig`;
}

function farFutureToken(offsetSeconds = 3600): string {
  return makeToken(Math.floor(Date.now() / 1000) + offsetSeconds);
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

describe("AuthContext identity switch", () => {
  let currentUserId: number;

  beforeEach(() => {
    configureApiClient(BASE);
    currentUserId = 1;
    server.use(
      http.get(`${BASE}/api/v1/me`, () => HttpResponse.json({ ...mockUser, id: currentUserId })),
      http.get(`${BASE}/api/v1/realtime/token`, () =>
        HttpResponse.json({
          token: `rt-${currentUserId}`,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        }),
      ),
    );
  });

  afterEach(() => {
    setActiveIdentityKey(null);
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it("swaps token, refetches the user, and refreshes the mercure token in place when the active identity changes", async () => {
    const tokenA = farFutureToken();
    setAccessToken(tokenA);
    setActiveIdentityKey("i1");

    const queryClient = new QueryClient();
    const { result } = renderHook(() => useAuthContext(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.user?.id).toBe(1));
    expect(result.current.token).toBe(tokenA);
    await waitFor(() => expect(result.current.mercureToken).toBe("rt-1"));

    const tokenB = farFutureToken(7200);
    currentUserId = 2;
    act(() => {
      setAccessToken(tokenB);
      setActiveIdentityKey("i2");
    });

    await waitFor(() => expect(result.current.token).toBe(tokenB));
    await waitFor(() => expect(result.current.user?.id).toBe(2));
    await waitFor(() => expect(result.current.mercureToken).toBe("rt-2"));
    expect(result.current.sessionExpired).toBe(false);
  });

  it("does not disturb auth state when the identity key is re-set to the same value", async () => {
    const tokenA = farFutureToken();
    setAccessToken(tokenA);
    setActiveIdentityKey("i1");

    const queryClient = new QueryClient();
    const { result } = renderHook(() => useAuthContext(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.user?.id).toBe(1));

    act(() => {
      setActiveIdentityKey("i1");
    });

    expect(result.current.user?.id).toBe(1);
    expect(result.current.token).toBe(tokenA);
  });
});
