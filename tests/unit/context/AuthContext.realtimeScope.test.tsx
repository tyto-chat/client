import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";

function sessionToken(): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `${header}.${payload}.sig`;
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("AuthContext realtime scope", () => {
  let requests: string[];

  beforeEach(() => {
    configureApiClient(BASE);
    requests = [];
    server.use(
      http.get(`${BASE}/api/v1/me`, () => HttpResponse.json(mockUser)),
      http.get(`${BASE}/api/v1/realtime/token`, async ({ request }) => {
        const search = new URL(request.url).search;
        requests.push(search);
        if (search.includes("slow")) await delay(50);
        return HttpResponse.json({
          token: `rt${search}`,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        });
      }),
    );
  });

  afterEach(() => setAccessToken(null));

  it("starts with a user-only token and re-mints for the active community and conversation", async () => {
    setAccessToken(sessionToken());
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.mercureToken).toBe("rt"));

    act(() => result.current.setRealtimeScope({ community: "tyto", conversation: "dm-1" }));

    await waitFor(() =>
      expect(result.current.mercureToken).toBe("rt?community=tyto&conversation=dm-1"),
    );
  });

  it("does not re-mint when the scope is unchanged", async () => {
    setAccessToken(sessionToken());
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.mercureToken).toBe("rt"));

    act(() => result.current.setRealtimeScope({ community: "tyto" }));
    await waitFor(() => expect(result.current.mercureToken).toBe("rt?community=tyto"));
    const count = requests.length;
    act(() => result.current.setRealtimeScope({ community: "tyto" }));

    expect(requests).toHaveLength(count);
  });

  it("keeps the newest scope when an older token response arrives late", async () => {
    setAccessToken(sessionToken());
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.mercureToken).toBe("rt"));

    act(() => result.current.setRealtimeScope({ community: "slow" }));
    act(() => result.current.setRealtimeScope({ community: "fast" }));

    await waitFor(() => expect(result.current.mercureToken).toBe("rt?community=fast"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(result.current.mercureToken).toBe("rt?community=fast");
  });
});
