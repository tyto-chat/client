import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { useInfiniteConversationMessages } from "@/queries/conversationQueries";

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

function pageJson(pageNumber: number) {
  return { "@id": `/api/conversations/abc/pages/${pageNumber}`, pageNumber, messages: [] };
}

beforeEach(() => {
  configureApiClient(BASE);
});

describe("useInfiniteConversationMessages", () => {
  it("paginates forward from a historical page up to latestPageNumber", async () => {
    server.use(
      http.get(`${BASE}/api/v1/conversations/abc/pages/:n`, ({ params }) =>
        HttpResponse.json(pageJson(Number(params.n))),
      ),
    );

    const qc = makeQueryClient();
    const { result, rerender } = renderHook(() => useInfiniteConversationMessages("abc", 2, 4), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    rerender();
    await waitFor(() =>
      expect(result.current.data?.pages.map((p) => p.pageNumber)).toEqual([2, 3]),
    );
  });

  it("has no next page when seeded at the latest page", async () => {
    server.use(
      http.get(`${BASE}/api/v1/conversations/abc/pages/:n`, ({ params }) =>
        HttpResponse.json(pageJson(Number(params.n))),
      ),
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useInfiniteConversationMessages("abc", 4, 4), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });
});
