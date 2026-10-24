import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { useLinkedEmojis, useLinkedMessage, useLinkedPlaces } from "@/queries/linkedMessageQueries";
import type { Message } from "@/types/api";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import {
  clearFakeDirectory,
  fakeEndpoint,
  registerFakeDirectory,
} from "../../mocks/serverDirectory";

const FOREIGN = "https://b.example";
const UUID = "11111111-1111-1111-1111-111111111111";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken(null);
  registerFakeDirectory([fakeEndpoint("ib", FOREIGN, { serverName: "Beta" })], "ia");
});
afterEach(clearFakeDirectory);

describe("useLinkedMessage", () => {
  it("keeps the same uuid on two origins in two cache entries", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${UUID}`, () => HttpResponse.json({ text: "here" })),
      http.get(`${FOREIGN}/api/v1/messages/${UUID}`, () => HttpResponse.json({ text: "there" })),
    );
    const { qc, wrapper } = setup();

    const local = renderHook(() => useLinkedMessage({ origin: BASE, uuid: UUID }), { wrapper });
    const remote = renderHook(() => useLinkedMessage({ origin: FOREIGN, uuid: UUID }), { wrapper });

    await waitFor(() => expect(local.result.current.data?.text).toBe("here"));
    await waitFor(() => expect(remote.result.current.data?.text).toBe("there"));
    expect(qc.getQueryCache().findAll()).toHaveLength(2);
  });

  it("does not reuse a foreign preview after the account behind that server changes", async () => {
    let calls = 0;
    server.use(
      http.get(`${FOREIGN}/api/v1/messages/${UUID}`, () => {
        calls += 1;
        return HttpResponse.json({ text: `seen by account ${calls}` });
      }),
    );
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      () => useLinkedMessage({ origin: FOREIGN, uuid: UUID }),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.data?.text).toBe("seen by account 1"));

    registerFakeDirectory([fakeEndpoint("ib-other", FOREIGN, { serverName: "Beta" })], "ia");
    rerender();

    await waitFor(() => expect(result.current.data?.text).toBe("seen by account 2"));
  });

  it("does not fetch for an unknown origin", async () => {
    let called = false;
    server.use(
      http.get("https://stranger.example/api/v1/messages/:id", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useLinkedMessage({ origin: "https://stranger.example", uuid: UUID }),
      { wrapper },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.fetchStatus).toBe("idle");
    expect(called).toBe(false);
  });

  it("errors on a foreign 404 without retrying", async () => {
    server.use(
      http.get(`${FOREIGN}/api/v1/messages/${UUID}`, () => new HttpResponse(null, { status: 404 })),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useLinkedMessage({ origin: FOREIGN, uuid: UUID }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

const message = { communityIdentifier: "comm", channelIdentifier: "chan" } as Message;

describe("useLinkedPlaces", () => {
  it("resolves channel, community and server names", async () => {
    server.use(
      http.get(`${FOREIGN}/api/v1/communities/comm/channels/chan`, () =>
        HttpResponse.json({ name: "general" }),
      ),
      http.get(`${FOREIGN}/api/v1/communities/comm`, () => HttpResponse.json({ name: "Tyto HQ" })),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useLinkedPlaces({ origin: FOREIGN, uuid: UUID }, message), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current).toEqual({ channel: "general", community: "Tyto HQ", server: "Beta" }),
    );
  });

  it("falls back to identifiers and the host when lookups fail", async () => {
    registerFakeDirectory([fakeEndpoint("ib", FOREIGN)], "ia");
    server.use(
      http.get(
        `${FOREIGN}/api/v1/communities/comm/channels/chan`,
        () => new HttpResponse(null, { status: 500 }),
      ),
      http.get(`${FOREIGN}/api/v1/communities/comm`, () => new HttpResponse(null, { status: 500 })),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useLinkedPlaces({ origin: FOREIGN, uuid: UUID }, message), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current).toEqual({ channel: "chan", community: "comm", server: "b.example" }),
    );
  });

  it("uses the community name from the connection snapshot without fetching it", async () => {
    registerFakeDirectory(
      [
        fakeEndpoint("ib", FOREIGN, {
          serverName: "Beta",
          communities: [{ identifier: "comm", name: "From Snapshot" } as never],
        }),
      ],
      "ia",
    );
    let communityFetched = false;
    server.use(
      http.get(`${FOREIGN}/api/v1/communities/comm`, () => {
        communityFetched = true;
        return HttpResponse.json({ name: "Fetched" });
      }),
      http.get(`${FOREIGN}/api/v1/communities/comm/channels/chan`, () =>
        HttpResponse.json({ name: "general" }),
      ),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useLinkedPlaces({ origin: FOREIGN, uuid: UUID }, message), {
      wrapper,
    });
    await waitFor(() => expect(result.current.channel).toBe("general"));
    expect(result.current.community).toBe("From Snapshot");
    expect(communityFetched).toBe(false);
  });
});

describe("useLinkedEmojis", () => {
  it("returns the foreign community's emoji list", async () => {
    server.use(
      http.get(`${FOREIGN}/api/v1/communities/comm/emojis`, () =>
        HttpResponse.json({ "hydra:member": [{ shortcode: "owl" }] }),
      ),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useLinkedEmojis({ origin: FOREIGN, uuid: UUID }, "comm"), {
      wrapper,
    });
    await waitFor(() => expect(result.current).toEqual([{ shortcode: "owl" }]));
  });

  it("stays undefined when the list cannot be read", async () => {
    server.use(
      http.get(
        `${FOREIGN}/api/v1/communities/comm/emojis`,
        () => new HttpResponse(null, { status: 403 }),
      ),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useLinkedEmojis({ origin: FOREIGN, uuid: UUID }, "comm"), {
      wrapper,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current).toBeUndefined();
  });
});
