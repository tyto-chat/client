import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { useAddCommunityMember } from "@/queries/communityQueries";
import { queryKeys } from "@/queries/queryKeys";

const COMMUNITY = "comm-1";

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

beforeEach(() => {
  configureApiClient(BASE);
});

describe("useAddCommunityMember", () => {
  it("POSTs the userId/role and invalidates the members cache on success", async () => {
    let received: unknown = null;
    server.use(
      http.post(`${BASE}/api/v1/communities/${COMMUNITY}/members/add`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ "@id": "/api/community_members/1", id: 1, role: "moderator" });
      }),
    );

    const queryClient = makeQueryClient();
    // Seed the members query so we can assert it gets invalidated.
    queryClient.setQueryData(queryKeys.communityMembers(COMMUNITY), []);

    const { result } = renderHook(() => useAddCommunityMember(COMMUNITY), {
      wrapper: makeWrapper(queryClient),
    });

    await act(() => result.current.mutateAsync({ userId: 42, role: "moderator" }));

    expect(received).toEqual({ userId: 42, role: "moderator" });

    await waitFor(() => {
      expect(queryClient.getQueryState(queryKeys.communityMembers(COMMUNITY))?.isInvalidated).toBe(
        true,
      );
    });
  });

  it("defaults the role to member when omitted", async () => {
    let received: unknown = null;
    server.use(
      http.post(`${BASE}/api/v1/communities/${COMMUNITY}/members/add`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ "@id": "/api/community_members/2", id: 2, role: "member" });
      }),
    );

    const queryClient = makeQueryClient();

    const { result } = renderHook(() => useAddCommunityMember(COMMUNITY), {
      wrapper: makeWrapper(queryClient),
    });

    await act(() => result.current.mutateAsync({ userId: 7 }));

    expect(received).toEqual({ userId: 7, role: "member" });
  });
});
