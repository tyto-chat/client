/**
 * IdentityAgent data sync + notification stream (Task 4).
 *
 * Reconnect-refetch coverage note: the fake EventSource in tests/mocks/EventSource.ts has
 * no `onopen` (see its header comment), so `subscribeMercure`'s real onopen->onReconnect path
 * can't be exercised end-to-end here. Per the task brief this is an accepted compromise: the
 * "reconnect drift-heal" test below invokes the agent's internal `refetchUnreadCounts` method
 * directly (via a narrow private-access cast) instead of driving it through a simulated
 * reconnect. Full onopen/onReconnect wiring stays covered at the `subscribeMercure`/
 * `useMercureSubscription` layer plus integration/e2e.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { getFakeEventSourceInstances, getLastFakeEventSource } from "../../mocks/EventSource";
import { IdentityAgent } from "@/desktop/agents/IdentityAgent";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { secretKey, type DesktopIdentity } from "@/desktop/desktopConfig";
import { _resetNegotiationForTests } from "@/api/apiVersion";

const ORIGIN = "https://data.example";
const PROFILE_ID = "p1";
const IDENTITY_ID = "i1";
const MERCURE_URL = "https://data.example/.well-known/mercure";

function makeIdentity(overrides: Partial<DesktopIdentity> = {}): DesktopIdentity {
  return {
    id: IDENTITY_ID,
    serverUrl: ORIGIN,
    email: "a@b.c",
    userId: null,
    displayName: null,
    ...overrides,
  };
}

function makeToken(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(JSON.stringify({ exp }));
  return `${header}.${payload}.sig`;
}

function farFutureToken(): string {
  return makeToken(Math.floor(Date.now() / 1000) + 3600);
}

function makeCallbacks() {
  return {
    onChange: vi.fn(),
    onNotification: vi.fn(),
    persistRotatedToken: vi.fn(async () => {}),
  };
}

function stubHealthyServer() {
  server.use(
    http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    http.get(`${ORIGIN}/api/v1/server-info`, () =>
      HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "Srv", mercureUrl: MERCURE_URL }),
    ),
    http.post(`${ORIGIN}/api/token/refresh`, () =>
      HttpResponse.json({ token: farFutureToken(), refresh_token: "rotated" }),
    ),
  );
}

interface StubDataOverrides {
  me?: { id: number };
  memberships?: unknown[];
  communities?: unknown[];
  counts?: Record<string, number>;
  realtimeExpiresAt?: number;
}

function stubData(overrides: StubDataOverrides = {}) {
  const me = overrides.me ?? { id: 42 };
  const memberships = overrides.memberships ?? [
    { communityId: 5, communityIdentifier: "team-alpha", role: "member" },
  ];
  const communities = overrides.communities ?? [
    {
      id: 5,
      identifier: "team-alpha",
      name: "Team Alpha",
      logo: { contentUrl: { sm: "https://cdn.example/logo-sm.png", md: "x", lg: "x" } },
      accentColor: "#112233",
    },
    { id: 6, identifier: "not-a-member", name: "Not A Member", logo: null, accentColor: null },
  ];
  const counts = overrides.counts ?? { "5": 2 };
  const realtimeExpiresAt = overrides.realtimeExpiresAt ?? Math.floor(Date.now() / 1000) + 3600;

  server.use(
    http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json(me)),
    http.get(`${ORIGIN}/api/v1/me/community-memberships`, () =>
      HttpResponse.json({ "hydra:member": memberships }),
    ),
    http.get(`${ORIGIN}/api/v1/communities`, () =>
      HttpResponse.json({ "hydra:member": communities }),
    ),
    http.get(`${ORIGIN}/api/v1/notifications/unread-counts`, () => HttpResponse.json({ counts })),
    http.get(`${ORIGIN}/api/v1/realtime/token`, () =>
      HttpResponse.json({ token: "rt-token", expiresAt: realtimeExpiresAt }),
    ),
  );
}

async function startHealthyAgentWithData(callbacks = makeCallbacks()) {
  stubHealthyServer();
  stubData();
  const bridge = createFakePlatformBridge();
  await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "old");
  const agent = new IdentityAgent(bridge, PROFILE_ID, makeIdentity(), callbacks);

  agent.start();
  await vi.waitFor(() => expect(agent.getSnapshot().status).toBe("healthy"));
  await vi.waitFor(() => expect(agent.getSnapshot().userId).toBe(42));

  return { agent, callbacks };
}

beforeEach(() => {
  localStorage.clear();
  _resetNegotiationForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("IdentityAgent data sync", () => {
  it("loads userId, member communities, and unread counts after reaching healthy", async () => {
    const { agent } = await startHealthyAgentWithData();

    const snapshot = agent.getSnapshot();
    expect(snapshot.userId).toBe(42);
    expect(snapshot.communities).toEqual([
      {
        id: 5,
        identifier: "team-alpha",
        name: "Team Alpha",
        logoUrl: "https://cdn.example/logo-sm.png",
        accentColor: "#112233",
      },
    ]);
    expect(snapshot.unreadCounts).toEqual({ "5": 2 });

    agent.stop();
  });

  it("subscribes to the notifications and conversation-activity topics for the loaded user", async () => {
    const { agent } = await startHealthyAgentWithData();

    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBeGreaterThan(0));
    const es = getLastFakeEventSource()!;
    expect(es.url).toContain(encodeURIComponent("/api/users/42/notifications"));
    expect(es.url).toContain(encodeURIComponent("/api/users/42/conversation-activity"));
    expect(es.url).toContain("rt-token");

    agent.stop();
  });

  it("bumps the dm unread count and fires onNotification for a dm_message notification", async () => {
    const { agent, callbacks } = await startHealthyAgentWithData();
    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBeGreaterThan(0));
    const es = getLastFakeEventSource()!;

    const raw = {
      type: "notification",
      id: 900,
      notificationType: "dm_message",
      isRead: false,
      communityId: null,
      communityIdentifier: "",
      channelIdentifier: "",
      conversationIdentifier: "conv-1",
      messageIri: null,
      authorName: "Ada",
      groupName: null,
      groupIdentifier: null,
      actorIds: null,
      messageCount: 1,
      createdAt: new Date().toISOString(),
    };
    es.dispatch(JSON.stringify(raw));

    await vi.waitFor(() => expect(agent.getSnapshot().unreadCounts.dm).toBe(1));
    expect(callbacks.onNotification).toHaveBeenCalledWith({
      identityId: IDENTITY_ID,
      origin: ORIGIN,
      serverName: "Srv",
      raw,
    });

    agent.stop();
  });

  it("bumps the per-community unread count for a non-dm notification", async () => {
    const { agent, callbacks } = await startHealthyAgentWithData();
    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBeGreaterThan(0));
    const es = getLastFakeEventSource()!;

    const raw = {
      type: "notification",
      id: 901,
      notificationType: "mention",
      isRead: false,
      communityId: 5,
      communityIdentifier: "team-alpha",
      channelIdentifier: "general",
      conversationIdentifier: null,
      messageIri: "/api/messages/abc",
      authorName: "Ada",
      groupName: null,
      groupIdentifier: null,
      actorIds: null,
      messageCount: 1,
      createdAt: new Date().toISOString(),
    };
    es.dispatch(JSON.stringify(raw));

    await vi.waitFor(() => expect(agent.getSnapshot().unreadCounts["5"]).toBe(3));
    expect(callbacks.onNotification).toHaveBeenCalledTimes(1);

    agent.stop();
  });

  it("ignores notification.update: no unread bump and no onNotification callback", async () => {
    const { agent, callbacks } = await startHealthyAgentWithData();
    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBeGreaterThan(0));
    const es = getLastFakeEventSource()!;

    const update = {
      type: "notification.update",
      id: 901,
      notificationType: "channel_activity",
      isRead: false,
      communityId: 5,
      communityIdentifier: "team-alpha",
      channelIdentifier: "general",
      conversationIdentifier: null,
      messageIri: null,
      authorName: "Ada",
      groupName: null,
      groupIdentifier: null,
      actorIds: [1, 2],
      messageCount: 2,
      createdAt: new Date().toISOString(),
    };
    es.dispatch(JSON.stringify(update));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(agent.getSnapshot().unreadCounts).toEqual({ "5": 2 });
    expect(callbacks.onNotification).not.toHaveBeenCalled();

    agent.stop();
  });

  it("reconnect drift-heal refetches unread counts (direct call — see file header)", async () => {
    const { agent } = await startHealthyAgentWithData();
    server.use(
      http.get(`${ORIGIN}/api/v1/notifications/unread-counts`, () =>
        HttpResponse.json({ counts: { "5": 9 } }),
      ),
    );

    const internals = agent as unknown as {
      connectionId: number;
      refetchUnreadCounts(myId: number): Promise<void>;
    };
    await internals.refetchUnreadCounts(internals.connectionId);

    expect(agent.getSnapshot().unreadCounts).toEqual({ "5": 9 });

    agent.stop();
  });

  it("stop() closes the SSE subscription", async () => {
    const { agent } = await startHealthyAgentWithData();
    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBeGreaterThan(0));
    const es = getLastFakeEventSource()!;
    const closeSpy = vi.spyOn(es, "close");

    agent.stop();

    expect(closeSpy).toHaveBeenCalled();
  });

  it("stop() cancels the realtime token re-mint timer", async () => {
    const { agent } = await startHealthyAgentWithData();
    const internals = agent as unknown as { realtimeRemintTimer: unknown };
    await vi.waitFor(() => expect(internals.realtimeRemintTimer).not.toBeNull());

    agent.stop();

    expect(internals.realtimeRemintTimer).toBeNull();
  });
});

describe("IdentityAgent data-load retry", () => {
  it("surfaces the error and stays healthy when the initial data load fails, then recovers on retry", async () => {
    vi.useFakeTimers();
    stubHealthyServer();
    let countsHits = 0;
    server.use(
      http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json({ id: 42 })),
      http.get(`${ORIGIN}/api/v1/me/community-memberships`, () =>
        HttpResponse.json({
          "hydra:member": [{ communityId: 5, communityIdentifier: "team-alpha", role: "member" }],
        }),
      ),
      http.get(`${ORIGIN}/api/v1/communities`, () =>
        HttpResponse.json({
          "hydra:member": [
            { id: 5, identifier: "team-alpha", name: "Team Alpha", logo: null, accentColor: null },
          ],
        }),
      ),
      http.get(`${ORIGIN}/api/v1/notifications/unread-counts`, () => {
        countsHits += 1;
        if (countsHits === 1) return HttpResponse.json({ error: "boom" }, { status: 500 });
        return HttpResponse.json({ counts: { "5": 4 } });
      }),
      http.get(`${ORIGIN}/api/v1/realtime/token`, () =>
        HttpResponse.json({ token: "rt-token", expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
      ),
    );

    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "old");
    const agent = new IdentityAgent(bridge, PROFILE_ID, makeIdentity(), makeCallbacks());

    agent.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(agent.getSnapshot().status).toBe("healthy");

    await vi.advanceTimersByTimeAsync(0);
    expect(countsHits).toBe(1);
    expect(agent.getSnapshot().status).toBe("healthy");
    expect(agent.getSnapshot().error).not.toBeNull();
    expect(agent.getSnapshot().unreadCounts).toEqual({});
    expect(getFakeEventSourceInstances().length).toBe(0);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(countsHits).toBe(2);
    expect(agent.getSnapshot().status).toBe("healthy");
    expect(agent.getSnapshot().error).toBeNull();
    expect(agent.getSnapshot().unreadCounts).toEqual({ "5": 4 });
    expect(getFakeEventSourceInstances().length).toBe(1);

    agent.stop();
  });

  it("stop() cancels a pending data-load retry", async () => {
    vi.useFakeTimers();
    stubHealthyServer();
    let countsHits = 0;
    server.use(
      http.get(`${ORIGIN}/api/v1/me`, () => HttpResponse.json({ id: 42 })),
      http.get(`${ORIGIN}/api/v1/me/community-memberships`, () =>
        HttpResponse.json({ "hydra:member": [] }),
      ),
      http.get(`${ORIGIN}/api/v1/communities`, () => HttpResponse.json({ "hydra:member": [] })),
      http.get(`${ORIGIN}/api/v1/notifications/unread-counts`, () => {
        countsHits += 1;
        return HttpResponse.json({ error: "boom" }, { status: 500 });
      }),
      http.get(`${ORIGIN}/api/v1/realtime/token`, () =>
        HttpResponse.json({ token: "rt-token", expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
      ),
    );

    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "old");
    const agent = new IdentityAgent(bridge, PROFILE_ID, makeIdentity(), makeCallbacks());

    agent.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(agent.getSnapshot().status).toBe("healthy");
    await vi.advanceTimersByTimeAsync(0);
    expect(countsHits).toBe(1);

    agent.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(countsHits).toBe(1);
  });
});
