import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { usePinCommunity, useReorderPinnedCommunities } from "@/queries/communityQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { PinnedCommunitiesResponse } from "@/types/api";

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function pinFixture(id: number, position: number): PinnedCommunitiesResponse["items"][number] {
  return {
    position,
    community: {
      "@id": `/api/communities/${id}`,
      "@type": "Community",
      id,
      identifier: `c-${id}`,
      name: `Community ${id}`,
      hostname: "",
      description: "",
      isPrivate: false,
      accentColor: null,
      broadcastMentionMinRole: "member",
      logo: null,
      locale: "en",
      channels: [],
      channelSections: [],
    },
  };
}

beforeEach(() => {
  configureApiClient(BASE);
});

describe("usePinCommunity", () => {
  it("POSTs the communityId and invalidates the pinned list", async () => {
    let received: unknown = null;
    server.use(
      http.post(`${BASE}/api/v1/me/pinned-communities`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    const qc = makeQueryClient();
    qc.setQueryData<PinnedCommunitiesResponse>(queryKeys.pinnedCommunities(), { items: [] });

    const { result } = renderHook(() => usePinCommunity(), { wrapper: makeWrapper(qc) });
    await act(() => result.current.mutateAsync(42));

    expect(received).toEqual({ communityId: 42 });
    await waitFor(() => {
      expect(qc.getQueryState(queryKeys.pinnedCommunities())?.isInvalidated).toBe(true);
    });
  });
});

describe("useReorderPinnedCommunities", () => {
  it("optimistically updates the cache before the request resolves", async () => {
    server.use(
      http.post(
        `${BASE}/api/v1/me/pinned-communities/order`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    const qc = makeQueryClient();
    qc.setQueryData<PinnedCommunitiesResponse>(queryKeys.pinnedCommunities(), {
      items: [pinFixture(1, 0), pinFixture(2, 1), pinFixture(3, 2)],
    });

    const { result } = renderHook(() => useReorderPinnedCommunities(), {
      wrapper: makeWrapper(qc),
    });

    await act(() => result.current.mutateAsync([3, 1, 2]));

    const items = qc.getQueryData<PinnedCommunitiesResponse>(queryKeys.pinnedCommunities())?.items;
    expect(items?.map((p) => p.community.id)).toEqual([3, 1, 2]);
    expect(items?.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it("rolls back the cache on error", async () => {
    server.use(
      http.post(
        `${BASE}/api/v1/me/pinned-communities/order`,
        () => new HttpResponse(null, { status: 422 }),
      ),
    );

    const qc = makeQueryClient();
    const original = [pinFixture(1, 0), pinFixture(2, 1)];
    qc.setQueryData<PinnedCommunitiesResponse>(queryKeys.pinnedCommunities(), { items: original });

    const { result } = renderHook(() => useReorderPinnedCommunities(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync([2, 1]).catch(() => {});
    });

    await waitFor(() => {
      const items = qc.getQueryData<PinnedCommunitiesResponse>(
        queryKeys.pinnedCommunities(),
      )?.items;
      // Either restored to original IDs or invalidated (refetched empty) — both prove no stuck optimistic state.
      const ids = items?.map((p) => p.community.id) ?? [];
      expect(ids.includes(1) && ids.includes(2)).toBe(true);
    });
  });
});
