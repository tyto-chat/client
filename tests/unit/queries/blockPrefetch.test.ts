import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { prefetchBlockedUsers, useBlockedUserIds } from "@/queries/blockQueries";
import { queryKeys } from "@/queries/queryKeys";

const BLOCKS_URL = `${BASE}/api/v1/me/blocks`;

function blocksResponse() {
  return HttpResponse.json({
    items: [
      { userId: 7, name: "x", avatarUrl: null, blockedAt: "2026-10-26T00:00:00Z", inEffect: true },
    ],
  });
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: 3 } } });
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
});

describe("prefetchBlockedUsers", () => {
  it("fills the cache so the first render already knows the blocked ids", async () => {
    server.use(http.get(BLOCKS_URL, () => blocksResponse()));
    const qc = makeClient();

    await prefetchBlockedUsers(qc, 300);

    const { result } = renderHook(() => useBlockedUserIds(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: qc }, children),
    });
    expect(result.current.has(7)).toBe(true);
  });

  it("never waits past its budget on a slow response", async () => {
    server.use(
      http.get(BLOCKS_URL, async () => {
        await delay(3000);
        return blocksResponse();
      }),
    );
    const started = Date.now();
    await prefetchBlockedUsers(makeClient(), 100);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("does not retry a failed fetch", async () => {
    let calls = 0;
    server.use(
      http.get(BLOCKS_URL, () => {
        calls++;
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const qc = makeClient();
    await prefetchBlockedUsers(qc);
    expect(calls).toBe(1);
    expect(qc.getQueryData(queryKeys.blocks())).toBeUndefined();
  });
});
