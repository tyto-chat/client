import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { prefetchBlockedUsers, useBlockedUserIds, useBlockedUsers } from "@/queries/blockQueries";
import { queryKeys } from "@/queries/queryKeys";

const auth = vi.hoisted(() => ({ userId: 1 as number | null }));

vi.mock("@/context/AuthContext", () => ({
  useOptionalAuthContext: () => ({ user: auth.userId === null ? null : { id: auth.userId } }),
}));

const BLOCKS_URL = `${BASE}/api/v1/me/blocks`;

function blocked(ids: number[]) {
  return HttpResponse.json({
    items: ids.map((userId) => ({
      userId,
      name: "x",
      avatarUrl: null,
      blockedAt: "2026-10-26T00:00:00Z",
      inEffect: true,
    })),
  });
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderIds(qc: QueryClient) {
  return renderHook(() => useBlockedUserIds(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children),
  });
}

async function seedCacheFor(userId: number, ids: number[]) {
  auth.userId = userId;
  server.use(http.get(BLOCKS_URL, () => blocked(ids)));
  const { result, unmount } = renderIds(makeClient());
  await waitFor(() => expect([...result.current]).toEqual(ids));
  unmount();
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  auth.userId = 1;
});

describe("blocked ids cache", () => {
  it("collapses on the first render from the last known ids when the fetch fails", async () => {
    await seedCacheFor(1, [7]);
    server.use(http.get(BLOCKS_URL, () => new HttpResponse(null, { status: 500 })));
    const qc = makeClient();

    const { result } = renderIds(qc);

    expect(result.current.has(7)).toBe(true);
    await waitFor(() => expect(qc.getQueryState(queryKeys.blocks())?.status).toBe("error"));
    expect(result.current.has(7)).toBe(true);
  });

  it("keeps the cache per signed-in user", async () => {
    await seedCacheFor(1, [7]);
    auth.userId = 2;
    server.use(http.get(BLOCKS_URL, () => new HttpResponse(null, { status: 500 })));

    const { result } = renderIds(makeClient());

    expect(result.current.size).toBe(0);
  });

  it("lets a successful fetch win over the cached ids", async () => {
    await seedCacheFor(1, [7]);
    server.use(http.get(BLOCKS_URL, () => blocked([])));

    const { result } = renderIds(makeClient());

    expect(result.current.has(7)).toBe(true);
    await waitFor(() => expect(result.current.size).toBe(0));
  });

  it("treats a 404 from an older server as no blocks without retrying", async () => {
    let calls = 0;
    server.use(
      http.get(BLOCKS_URL, () => {
        calls++;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 1 } } });

    const { result } = renderHook(() => useBlockedUsers(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: qc }, children),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(calls).toBe(1);

    const prefetchClient = new QueryClient({ defaultOptions: { queries: { retry: 3 } } });
    await prefetchBlockedUsers(prefetchClient);
    expect(prefetchClient.getQueryData(queryKeys.blocks())).toEqual([]);
  });
});
