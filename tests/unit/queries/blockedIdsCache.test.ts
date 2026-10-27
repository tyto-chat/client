import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import {
  prefetchBlockedUsers,
  useBlockedUserIds,
  useBlockedUsers,
  useBlockUser,
  useUnblockUser,
} from "@/queries/blockQueries";
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

  function renderWithMutations(qc: QueryClient) {
    return renderHook(
      () => ({ ids: useBlockedUserIds(), block: useBlockUser(), unblock: useUnblockUser() }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client: qc }, children),
      },
    );
  }

  const entry = {
    userId: 7,
    name: "x",
    avatarUrl: null,
    blockedAt: "2026-10-26T00:00:00Z",
    inEffect: true,
  };

  it("collapses right after a confirmed block even when the refetch fails", async () => {
    server.use(
      http.post(BLOCKS_URL, () => HttpResponse.json(entry)),
      http.get(BLOCKS_URL, () => new HttpResponse(null, { status: 500 })),
    );
    const qc = makeClient();
    qc.setQueryData(queryKeys.blocks(), []);
    const { result } = renderWithMutations(qc);
    expect(result.current.ids.has(7)).toBe(false);

    await act(() => result.current.block.mutateAsync(7));

    await waitFor(() => expect(qc.getQueryState(queryKeys.blocks())?.status).toBe("error"));
    expect(result.current.ids.has(7)).toBe(true);
  });

  it("expands right after a confirmed unblock even when the refetch fails", async () => {
    server.use(
      http.delete(`${BLOCKS_URL}/7`, () => new HttpResponse(null, { status: 204 })),
      http.get(BLOCKS_URL, () => new HttpResponse(null, { status: 500 })),
    );
    const qc = makeClient();
    qc.setQueryData(queryKeys.blocks(), [entry]);
    const { result } = renderWithMutations(qc);
    await waitFor(() => expect(result.current.ids.has(7)).toBe(true));

    await act(() => result.current.unblock.mutateAsync(7));

    await waitFor(() => expect(qc.getQueryState(queryKeys.blocks())?.status).toBe("error"));
    expect(result.current.ids.has(7)).toBe(false);
  });

  it("expands after an unblock when only the remembered ids were known", async () => {
    await seedCacheFor(1, [7]);
    server.use(
      http.delete(`${BLOCKS_URL}/7`, () => new HttpResponse(null, { status: 204 })),
      http.get(BLOCKS_URL, () => new HttpResponse(null, { status: 500 })),
    );
    const { result } = renderWithMutations(makeClient());
    expect(result.current.ids.has(7)).toBe(true);

    await act(() => result.current.unblock.mutateAsync(7));

    await waitFor(() => expect(result.current.ids.has(7)).toBe(false));
  });

  it("keeps a confirmed block when an older blocks read resolves afterwards", async () => {
    let reads = 0;
    server.use(
      http.post(BLOCKS_URL, () => HttpResponse.json(entry)),
      http.get(BLOCKS_URL, async () => {
        reads++;
        if (reads === 1) {
          await delay(300);
          return blocked([]);
        }
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const qc = makeClient();
    qc.setQueryData(queryKeys.blocks(), [], { updatedAt: 0 });
    const { result } = renderHook(() => useBlockUser(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: qc }, children),
    });
    const staleRead = prefetchBlockedUsers(qc);
    await waitFor(() => expect(reads).toBe(1));

    await act(() => result.current.mutateAsync(7));
    await act(() => staleRead);
    await act(() => new Promise((r) => setTimeout(r, 400)));

    expect(qc.getQueryData<{ userId: number }[]>(queryKeys.blocks())?.map((b) => b.userId)).toEqual(
      [7],
    );
    expect(renderIds(qc).result.current.has(7)).toBe(true);
  });
});
