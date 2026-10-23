import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";

function sessionToken(): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 7200 }));
  return `${header}.${payload}.sig`;
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

type Reply = { status: number } | { token: string };

function stubMint(path: string, replies: Reply[]) {
  const hits: number[] = [];
  server.use(
    http.get(`${BASE}/api/v1/realtime/${path}`, () => {
      hits.push(Date.now());
      const reply = replies.length > 1 ? replies.shift()! : replies[0]!;
      if ("status" in reply) return HttpResponse.json({ error: "x" }, { status: reply.status });
      return HttpResponse.json({
        token: reply.token,
        expiresAt: Math.floor(Date.now() / 1000) + 600,
      });
    }),
  );
  return hits;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("AuthContext realtime re-mint resilience", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    configureApiClient(BASE);
    server.use(http.get(`${BASE}/api/v1/me`, () => HttpResponse.json(mockUser)));
  });

  afterEach(() => {
    setAccessToken(null);
    vi.useRealTimers();
  });

  async function mountAuthed(replies: Reply[]) {
    const hits = stubMint("token", replies);
    setAccessToken(sessionToken());
    const view = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(view.result.current.mercureToken).toBe("rt-1"));
    return { ...view, hits };
  }

  it("keeps the current token when a re-mint fails and retries with backoff", async () => {
    const { result, hits } = await mountAuthed([
      { token: "rt-1" },
      { status: 502 },
      { status: 502 },
      { status: 502 },
      { status: 502 },
      { status: 502 },
      { token: "rt-2" },
    ]);

    await advance(300_000);
    await waitFor(() => expect(hits.length).toBeGreaterThanOrEqual(2));
    expect(result.current.mercureToken).toBe("rt-1");

    for (let i = 0; i < 5; i++) {
      await advance(60_000);
      await waitFor(() => expect(hits.length).toBeGreaterThanOrEqual(3 + i));
    }

    const gaps = hits.slice(1, 7).map((at, i) => hits[i + 2]! - at);
    for (const [i, expected] of [5_000, 15_000, 30_000, 60_000, 60_000].entries()) {
      expect(gaps[i]).toBeGreaterThanOrEqual(expected);
      expect(gaps[i]).toBeLessThan(expected + 2_000);
    }
    await waitFor(() => expect(result.current.mercureToken).toBe("rt-2"));
  });

  it("schedules the next mint from expiresIn instead of the five-minute fallback", async () => {
    const hits: number[] = [];
    server.use(
      http.get(`${BASE}/api/v1/realtime/token`, () => {
        hits.push(Date.now());
        return HttpResponse.json({
          token: `rt-${hits.length}`,
          expiresAt: Math.floor(Date.now() / 1000) + 1800,
          expiresIn: 1800,
        });
      }),
    );
    setAccessToken(sessionToken());
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.mercureToken).toBe("rt-1"));

    await advance(1_670_000);
    expect(hits).toHaveLength(1);

    await advance(20_000);
    await waitFor(() => expect(result.current.mercureToken).toBe("rt-2"));
  });

  it("ignores a token reply that lands after the session expired", async () => {
    const { result } = await mountAuthed([{ token: "rt-1" }]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`${BASE}/api/v1/realtime/token`, async () => {
        await gate;
        return HttpResponse.json({
          token: "rt-late",
          expiresAt: Math.floor(Date.now() / 1000) + 1800,
          expiresIn: 1800,
        });
      }),
    );
    act(() => {
      void result.current.refreshMercureToken();
    });
    act(() => {
      window.dispatchEvent(new Event("session:expired"));
    });
    release();
    await advance(1000);

    expect(result.current.mercureToken).toBeNull();
  });

  it("keeps the retry backoff when the tab becomes visible during a token outage", async () => {
    const { hits } = await mountAuthed([{ token: "rt-1" }, { status: 502 }, { status: 502 }]);
    await advance(300_000);
    await waitFor(() => expect(hits.length).toBe(2));

    setVisibility("hidden");
    setVisibility("visible");
    setVisibility("hidden");
    setVisibility("visible");
    await advance(1000);

    expect(hits.length).toBe(2);
  });

  it("drops the token on a definitive 403 and does not retry", async () => {
    const { result, hits } = await mountAuthed([{ token: "rt-1" }, { status: 403 }]);

    await advance(300_000);

    await waitFor(() => expect(result.current.mercureToken).toBeNull());
    await advance(600_000);
    expect(hits).toHaveLength(2);
  });

  it("re-mints when the tab becomes visible after its refresh time has passed", async () => {
    const { result, hits } = await mountAuthed([{ token: "rt-1" }, { token: "rt-2" }]);
    vi.setSystemTime(Date.now() + 400_000);

    await act(async () => setVisibility("visible"));

    await waitFor(() => expect(result.current.mercureToken).toBe("rt-2"));
    expect(hits).toHaveLength(2);
  });

  it("does not re-mint on visibility before the refresh time", async () => {
    const { hits } = await mountAuthed([{ token: "rt-1" }]);

    await act(async () => setVisibility("visible"));
    await act(async () => setVisibility("hidden"));
    await advance(10);

    expect(hits).toHaveLength(1);
  });

  it("re-mints immediately when the network comes back while overdue", async () => {
    const { result, hits } = await mountAuthed([
      { token: "rt-1" },
      { status: 502 },
      { token: "rt-2" },
    ]);
    await advance(300_000);
    await waitFor(() => expect(hits).toHaveLength(2));

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.mercureToken).toBe("rt-2"));
    expect(hits[2]! - hits[1]!).toBeLessThan(5_000);
  });

  it("applies the same retry to the anonymous public token", async () => {
    const hits = stubMint("public-token", [
      { token: "pub-1" },
      { status: 502 },
      { token: "pub-2" },
    ]);
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.mercureToken).toBe("pub-1"));
    const before = hits.length;

    await advance(300_000);
    await waitFor(() => expect(hits).toHaveLength(before + 1));
    expect(result.current.mercureToken).toBe("pub-1");

    await advance(5_000);
    await waitFor(() => expect(result.current.mercureToken).toBe("pub-2"));
  });
  it("coalesces a burst of refresh requests into the in-flight mint plus one trailing mint", async () => {
    const { result, hits } = await mountAuthed([{ token: "rt-1" }, { token: "rt-2" }]);

    await act(async () => {
      await Promise.all(Array.from({ length: 5 }, () => result.current.refreshMercureToken()));
    });

    expect(hits).toHaveLength(3);
    expect(result.current.mercureToken).toBe("rt-2");
  });

  it("falls back to the unscoped token when a scoped mint is forbidden", async () => {
    const scopes: string[] = [];
    server.use(
      http.get(`${BASE}/api/v1/realtime/token`, ({ request }) => {
        const search = new URL(request.url).search;
        scopes.push(search);
        if (search.includes("community")) {
          return HttpResponse.json({ error: "x" }, { status: 403 });
        }
        return HttpResponse.json({
          token: `rt${search}`,
          expiresAt: Math.floor(Date.now() / 1000) + 600,
        });
      }),
    );
    setAccessToken(sessionToken());
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.mercureToken).toBe("rt"));

    act(() => result.current.setRealtimeScope({ community: "gone" }));

    await waitFor(() => expect(scopes).toEqual(["", "?community=gone", ""]));
    expect(result.current.mercureToken).toBe("rt");
  });
});
