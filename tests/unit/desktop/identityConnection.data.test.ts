/**
 * IdentityConnection data sync + notification stream (Task 4).
 *
 * Reconnect-refetch coverage note: the fake EventSource in tests/mocks/EventSource.ts has
 * no `onopen` (see its header comment), so `subscribeMercure`'s real onopen->onReconnect path
 * can't be exercised end-to-end here. Per the task brief this is an accepted compromise: the
 * "reconnect drift-heal" test below invokes the connection's internal `refetchUnreadCounts` method
 * directly (via a narrow private-access cast) instead of driving it through a simulated
 * reconnect. Full onopen/onReconnect wiring stays covered at the `subscribeMercure`/
 * `useMercureSubscription` layer plus integration/e2e.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { getFakeEventSourceInstances, getLastFakeEventSource } from "../../mocks/EventSource";
import { IdentityConnection } from "@/desktop/connections/IdentityConnection";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import {
  loadDesktopConfig,
  saveDesktopConfig,
  secretKey,
  type DesktopIdentity,
} from "@/desktop/desktopConfig";
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
  me?: Record<string, unknown>;
  memberships?: unknown[];
  communities?: unknown[];
  pinned?: unknown[];
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
    http.get(`${ORIGIN}/api/v1/me/pinned-communities`, () =>
      HttpResponse.json({ "hydra:member": overrides.pinned ?? [] }),
    ),
    http.get(`${ORIGIN}/api/v1/notifications/unread-counts`, () => HttpResponse.json({ counts })),
    http.get(`${ORIGIN}/api/v1/realtime/token`, () =>
      HttpResponse.json({ token: "rt-token", expiresAt: realtimeExpiresAt }),
    ),
  );
}

async function startHealthyConnectionWithData(callbacks = makeCallbacks()) {
  stubHealthyServer();
  stubData();
  const bridge = createFakePlatformBridge();
  await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "old");
  const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), callbacks);

  connection.start();
  await vi.waitFor(() => expect(connection.getSnapshot().status).toBe("healthy"));
  await vi.waitFor(() => expect(connection.getSnapshot().userId).toBe(42));

  return { connection, callbacks };
}

beforeEach(() => {
  localStorage.clear();
  _resetNegotiationForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("IdentityConnection data sync", () => {
  it("loads userId, all visible communities with member/pinned flags, and unread counts after reaching healthy", async () => {
    const { connection } = await startHealthyConnectionWithData();

    const snapshot = connection.getSnapshot();
    expect(snapshot.userId).toBe(42);
    expect(snapshot.communities).toEqual([
      {
        id: 5,
        identifier: "team-alpha",
        name: "Team Alpha",
        logoUrl: "https://cdn.example/logo-sm.png",
        accentColor: "#112233",
        iri: null,
        member: true,
        pinned: false,
        isPrivate: false,
      },
      {
        id: 6,
        identifier: "not-a-member",
        name: "Not A Member",
        logoUrl: null,
        accentColor: null,
        iri: null,
        member: false,
        pinned: false,
        isPrivate: false,
      },
    ]);
    expect(snapshot.unreadCounts).toEqual({ "5": 2 });

    connection.stop();
  });

  it("caches the display name and avatar on the identity so relogin can show them offline", async () => {
    stubHealthyServer();
    stubData({
      me: {
        id: 42,
        profile: {
          name: "Ada Lovelace",
          avatar: { contentUrl: { sm: "/media/avatar-sm.png", md: "x", lg: "x" } },
        },
      },
    });
    server.use(
      http.get(`${ORIGIN}/media/avatar-sm.png`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, {
          headers: { "Content-Type": "image/png" },
        }),
      ),
    );

    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "old");
    await saveDesktopConfig(bridge, {
      version: 1,
      lastActiveProfileId: PROFILE_ID,
      autoOpenLastProfile: true,
      profiles: [
        {
          id: PROFILE_ID,
          name: "Default",
          color: null,
          lastActiveIdentityId: IDENTITY_ID,
          identities: [makeIdentity()],
        },
      ],
    });

    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), makeCallbacks());
    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().userId).toBe(42));

    await vi.waitFor(async () => {
      const stored = (await loadDesktopConfig(bridge)).profiles[0]?.identities[0];
      expect(stored?.displayName).toBe("Ada Lovelace");
      expect(stored?.avatarSource).toBe("/media/avatar-sm.png");
      expect(stored?.avatarDataUrl).toMatch(/^data:/);
    });
  });

  it("caches an animated-GIF avatar whole so the relogin screen keeps the animation", async () => {
    stubHealthyServer();
    stubData({
      me: {
        id: 42,
        profile: {
          name: "Gif Fan",
          avatar: { contentUrl: { sm: "/media/avatar.gif", md: "x", lg: "x" } },
        },
      },
    });
    server.use(
      http.get(`${ORIGIN}/media/avatar.gif`, () =>
        HttpResponse.arrayBuffer(new Uint8Array(400_000).buffer, {
          headers: { "Content-Type": "image/gif" },
        }),
      ),
    );

    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "old");
    await saveDesktopConfig(bridge, {
      version: 1,
      lastActiveProfileId: PROFILE_ID,
      autoOpenLastProfile: true,
      profiles: [
        {
          id: PROFILE_ID,
          name: "Default",
          color: null,
          lastActiveIdentityId: IDENTITY_ID,
          identities: [makeIdentity()],
        },
      ],
    });

    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), makeCallbacks());
    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().userId).toBe(42));

    await vi.waitFor(async () => {
      const stored = (await loadDesktopConfig(bridge)).profiles[0]?.identities[0];
      expect(stored?.avatarDataUrl).toMatch(/^data:image\/gif/);
    });
  });

  it("subscribes to the notifications and conversation-activity topics for the loaded user", async () => {
    const { connection } = await startHealthyConnectionWithData();

    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBeGreaterThan(0));
    const es = getLastFakeEventSource()!;
    expect(es.url).toContain(encodeURIComponent("/api/users/42/notifications"));
    expect(es.url).toContain(encodeURIComponent("/api/users/42/conversation-activity"));
    expect(es.url).toContain("rt-token");

    connection.stop();
  });

  it("bumps the dm unread count and fires onNotification for a dm_message notification", async () => {
    const { connection, callbacks } = await startHealthyConnectionWithData();
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

    await vi.waitFor(() => expect(connection.getSnapshot().unreadCounts.dm).toBe(1));
    expect(callbacks.onNotification).toHaveBeenCalledWith({
      identityId: IDENTITY_ID,
      origin: ORIGIN,
      serverName: "Srv",
      raw,
    });

    connection.stop();
  });

  it("bumps the per-community unread count for a non-dm notification", async () => {
    const { connection, callbacks } = await startHealthyConnectionWithData();
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

    await vi.waitFor(() => expect(connection.getSnapshot().unreadCounts["5"]).toBe(3));
    expect(callbacks.onNotification).toHaveBeenCalledTimes(1);

    connection.stop();
  });

  it("ignores notification.update: no unread bump and no onNotification callback", async () => {
    const { connection, callbacks } = await startHealthyConnectionWithData();
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
    expect(connection.getSnapshot().unreadCounts).toEqual({ "5": 2 });
    expect(callbacks.onNotification).not.toHaveBeenCalled();

    connection.stop();
  });

  it("marks only really-joined communities as member, even for a ROLE_ADMIN user", async () => {
    stubHealthyServer();
    stubData({ me: { id: 42, roles: ["ROLE_USER", "ROLE_ADMIN"] } as unknown as { id: number } });
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "old");
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), makeCallbacks());

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().userId).toBe(42));

    expect(connection.getSnapshot().communities.map((c) => c.member)).toEqual([true, false]);

    connection.stop();
  });

  it("refreshRailData refetches communities and pins into the snapshot without resubscribing SSE", async () => {
    const { connection } = await startHealthyConnectionWithData();
    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBeGreaterThan(0));
    const esCountBefore = getFakeEventSourceInstances().length;
    expect(connection.getSnapshot().communities.find((c) => c.id === 5)!.pinned).toBe(false);

    stubData({
      pinned: [
        {
          community: {
            id: 5,
            identifier: "team-alpha",
            name: "Team Alpha",
            logo: null,
            accentColor: "#112233",
          },
        },
      ],
    });
    await connection.refreshRailData();

    expect(connection.getSnapshot().communities.find((c) => c.id === 5)!.pinned).toBe(true);
    expect(connection.railSeed()!.pinned).toHaveLength(1);
    expect(getFakeEventSourceInstances().length).toBe(esCountBefore);

    connection.stop();
  });

  it("reconnect drift-heal refetches unread counts (direct call — see file header)", async () => {
    const { connection } = await startHealthyConnectionWithData();
    server.use(
      http.get(`${ORIGIN}/api/v1/notifications/unread-counts`, () =>
        HttpResponse.json({ counts: { "5": 9 } }),
      ),
    );

    const internals = connection as unknown as {
      connectionId: number;
      refetchUnreadCounts(myId: number): Promise<void>;
    };
    await internals.refetchUnreadCounts(internals.connectionId);

    expect(connection.getSnapshot().unreadCounts).toEqual({ "5": 9 });

    connection.stop();
  });

  it("stop() closes the SSE subscription", async () => {
    const { connection } = await startHealthyConnectionWithData();
    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBeGreaterThan(0));
    const es = getLastFakeEventSource()!;
    const closeSpy = vi.spyOn(es, "close");

    connection.stop();

    expect(closeSpy).toHaveBeenCalled();
  });

  it("stop() cancels the realtime token re-mint timer", async () => {
    const { connection } = await startHealthyConnectionWithData();
    const internals = connection as unknown as { realtimeRemintTimer: unknown };
    await vi.waitFor(() => expect(internals.realtimeRemintTimer).not.toBeNull());

    connection.stop();

    expect(internals.realtimeRemintTimer).toBeNull();
  });

  it("emitting a conversation.activity event updates snapshot.conversationActivityAt and notifies subscribers", async () => {
    const { connection } = await startHealthyConnectionWithData();
    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBeGreaterThan(0));
    const es = getLastFakeEventSource()!;

    const beforeTime = Date.now();
    const event = {
      type: "conversation.activity",
      conversationIdentifier: "conv-1",
      lastMessageAt: new Date().toISOString(),
    };
    es.dispatch(JSON.stringify(event));

    await vi.waitFor(() => {
      const snap = connection.getSnapshot();
      expect(snap.conversationActivityAt).not.toBeNull();
      expect(snap.conversationActivityAt).toBeGreaterThanOrEqual(beforeTime);
    });

    connection.stop();
  });

  it("emitting a notification event leaves snapshot.conversationActivityAt untouched", async () => {
    const { connection } = await startHealthyConnectionWithData();
    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBeGreaterThan(0));
    const es = getLastFakeEventSource()!;

    const snapBefore = connection.getSnapshot();
    expect(snapBefore.conversationActivityAt).toBeNull();

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

    await vi.waitFor(() => expect(connection.getSnapshot().unreadCounts.dm).toBe(1));

    const snapAfter = connection.getSnapshot();
    expect(snapAfter.conversationActivityAt).toBeNull();

    connection.stop();
  });

  it("ignores a malformed (non-JSON) realtime event instead of throwing", async () => {
    const { connection } = await startHealthyConnectionWithData();
    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBeGreaterThan(0));
    const es = getLastFakeEventSource()!;

    const snapBefore = connection.getSnapshot();
    expect(() => es.dispatch("not json")).not.toThrow();

    const snapAfter = connection.getSnapshot();
    expect(snapAfter.conversationActivityAt).toBe(snapBefore.conversationActivityAt);
    expect(snapAfter.unreadCounts).toEqual(snapBefore.unreadCounts);

    connection.stop();
  });
});

describe("IdentityConnection data-load retry", () => {
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
      http.get(`${ORIGIN}/api/v1/me/pinned-communities`, () =>
        HttpResponse.json({ "hydra:member": [] }),
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
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), makeCallbacks());

    connection.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.getSnapshot().status).toBe("healthy");

    await vi.advanceTimersByTimeAsync(0);
    expect(countsHits).toBe(1);
    expect(connection.getSnapshot().status).toBe("healthy");
    expect(connection.getSnapshot().error).not.toBeNull();
    expect(connection.getSnapshot().unreadCounts).toEqual({});
    expect(getFakeEventSourceInstances().length).toBe(0);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(countsHits).toBe(2);
    expect(connection.getSnapshot().status).toBe("healthy");
    expect(connection.getSnapshot().error).toBeNull();
    expect(connection.getSnapshot().unreadCounts).toEqual({ "5": 4 });
    expect(getFakeEventSourceInstances().length).toBe(1);

    connection.stop();
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
      http.get(`${ORIGIN}/api/v1/me/pinned-communities`, () =>
        HttpResponse.json({ "hydra:member": [] }),
      ),
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
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), makeCallbacks());

    connection.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.getSnapshot().status).toBe("healthy");
    await vi.advanceTimersByTimeAsync(0);
    expect(countsHits).toBe(1);

    connection.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(countsHits).toBe(1);
  });
});
