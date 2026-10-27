import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../mocks/server";
import { Route as DmRoute } from "@/routes/_app/dm/$conversationId";
import { Route as ChannelRoute } from "@/routes/_app/$communityId/$channelId";
import { Route as AppRoute } from "@/routes/_app";
import { queryKeys } from "@/queries/queryKeys";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";

const BLOCKS_URL = `${BASE}/api/v1/me/blocks`;
const DM = "dm-1";

function blocksResponse() {
  return HttpResponse.json({
    items: [
      { userId: 7, name: "x", avatarUrl: null, blockedAt: "2026-10-26T00:00:00Z", inEffect: true },
    ],
  });
}

function emptyPages() {
  return HttpResponse.json({ "@type": "Collection", "hydra:member": [], totalItems: 0 });
}

function runDmLoader(queryClient: QueryClient) {
  const loader = DmRoute.options.loader as (args: unknown) => Promise<unknown>;
  return loader({
    context: { queryClient, auth: { token: "test-token" } },
    params: { conversationId: DM },
    deps: {},
  });
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  server.use(
    http.get(`${BASE}/api/v1/conversations/${DM}/pages`, () => emptyPages()),
    http.get(`${BASE}/api/v1/conversations/${DM}`, () => HttpResponse.json({ identifier: DM })),
    http.get(`${BASE}/api/v1/me/community-memberships`, () => HttpResponse.json([])),
    http.get(`${BASE}/api/v1/communities/comm-1/members`, () => emptyPages()),
    http.get(`${BASE}/api/v1/communities/comm-1/membership`, () => HttpResponse.json({})),
  );
});

describe("blocklist prefetch in loaders", () => {
  it("DM loader leaves the blocklist cached before the first render", async () => {
    server.use(http.get(BLOCKS_URL, () => blocksResponse()));
    const qc = new QueryClient();
    await runDmLoader(qc);
    expect(qc.getQueryData(queryKeys.blocks())).toHaveLength(1);
  });

  it("DM loader does not wait for a slow blocklist beyond its budget", async () => {
    server.use(
      http.get(BLOCKS_URL, async () => {
        await delay(3000);
        return blocksResponse();
      }),
    );
    const started = Date.now();
    await runDmLoader(new QueryClient());
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("app shell loader starts the blocklist fetch for signed-in users only", () => {
    server.use(http.get(BLOCKS_URL, () => blocksResponse()));
    const loader = AppRoute.options.loader as (args: unknown) => unknown;
    const anon = new QueryClient();
    loader({ context: { queryClient: anon, auth: { token: null } } });
    expect(anon.getQueryState(queryKeys.blocks())).toBeUndefined();

    const signedIn = new QueryClient();
    loader({ context: { queryClient: signedIn, auth: { token: "test-token" } } });
    expect(signedIn.getQueryState(queryKeys.blocks())?.fetchStatus).toBe("fetching");
  });

  it("signed-in channel loader leaves the blocklist cached", async () => {
    server.use(http.get(BLOCKS_URL, () => blocksResponse()));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.community("comm-1"), {
      identifier: "comm-1",
      channels: [{ identifier: "voice", type: "audio" }],
    });
    const loader = ChannelRoute.options.loader as (args: unknown) => Promise<unknown>;
    await loader({
      context: { queryClient: qc, auth: { token: "test-token" } },
      params: { communityId: "comm-1", channelId: "voice" },
      deps: {},
    });
    expect(qc.getQueryData(queryKeys.blocks())).toHaveLength(1);
  });

  it("anonymous channel loader never requests the blocklist", async () => {
    let calls = 0;
    server.use(
      http.get(BLOCKS_URL, () => {
        calls++;
        return blocksResponse();
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.community("comm-1"), {
      identifier: "comm-1",
      channels: [{ identifier: "voice", type: "audio" }],
    });
    const loader = ChannelRoute.options.loader as (args: unknown) => Promise<unknown>;
    await loader({
      context: { queryClient: qc, auth: { token: null } },
      params: { communityId: "comm-1", channelId: "voice" },
      deps: {},
    });
    expect(calls).toBe(0);
    expect(qc.getQueryState(queryKeys.blocks())).toBeUndefined();
  });
});
