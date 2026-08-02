import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { useCommunitySearch } from "@/queries/searchQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { SearchResult } from "@/api/search";

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

const emptyResult: SearchResult = { hits: [], total: 0, limit: 25, offset: 0 };

beforeEach(() => {
  configureApiClient(BASE);
});

describe("queryKeys.communitySearch", () => {
  it("is distinct from channelSearch for the same community", () => {
    expect(queryKeys.communitySearch("acme", "hello")).not.toEqual(
      queryKeys.channelSearch("acme", "general", "hello"),
    );
  });
});

describe("useCommunitySearch", () => {
  it("fetches community search results", async () => {
    let requestedUrl = "";
    server.use(
      http.get(`${BASE}/api/v1/communities/acme/search`, ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ ...emptyResult, total: 3 });
      }),
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useCommunitySearch("acme", "hello", { authorId: 7 }), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(3);
    expect(requestedUrl).toContain("q=hello");
    expect(requestedUrl).toContain("authorId=7");
  });

  it("stays disabled for short queries and empty community id", () => {
    const qc = makeQueryClient();
    const short = renderHook(() => useCommunitySearch("acme", "h"), {
      wrapper: makeWrapper(qc),
    });
    const noId = renderHook(() => useCommunitySearch("", "hello"), {
      wrapper: makeWrapper(qc),
    });

    expect(short.result.current.fetchStatus).toBe("idle");
    expect(noId.result.current.fetchStatus).toBe("idle");
  });
});
