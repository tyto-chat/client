import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { usePresenceHistory } from "@/queries/presenceQueries";

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

beforeEach(() => {
  configureApiClient(BASE);
});

describe("usePresenceHistory", () => {
  it("fetches samples for the community and window", async () => {
    server.use(
      http.get(`${BASE}/api/v1/communities/dragon/presence/history`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("days")).toBe("7");
        return HttpResponse.json({
          samples: [{ sampledAt: "2026-08-01T10:00:00+00:00", membersOnline: 5, guestsOnline: 2 }],
        });
      }),
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => usePresenceHistory("dragon", 7), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.[0]?.membersOnline).toBe(5);
  });
});
