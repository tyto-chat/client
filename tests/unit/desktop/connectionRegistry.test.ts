import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { getFakeEventSourceInstances } from "../../mocks/EventSource";
import { ConnectionRegistry } from "@/desktop/connections/ConnectionRegistry";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { secretKey, type DesktopIdentity } from "@/desktop/desktopConfig";
import { _resetNegotiationForTests } from "@/api/apiVersion";
import { __resetRefreshStateForTests, refreshAccessToken, setRefreshExecutor } from "@/api/auth";
import { setAccessToken } from "@/api/tokenStore";

const ORIGIN_A = "https://a.example";
const ORIGIN_B = "https://b.example";
const PROFILE_ID = "p1";

function makeIdentity(id: string, origin: string): DesktopIdentity {
  return { id, serverUrl: origin, email: `${id}@example.com`, userId: null, displayName: null };
}

function makeToken(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(JSON.stringify({ exp }));
  return `${header}.${payload}.sig`;
}

function farFutureToken(): string {
  return makeToken(Math.floor(Date.now() / 1000) + 3600);
}

function stubServerInfo(origin: string, name: string, mercureUrl?: string) {
  server.use(
    http.get(`${origin}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    http.get(`${origin}/api/v1/server-info`, () =>
      HttpResponse.json({ apiUrl: `${origin}/api`, name, mercureUrl }),
    ),
  );
}

function stubRefresh(origin: string, refreshToken = "rotated") {
  server.use(
    http.post(`${origin}/api/token/refresh`, () =>
      HttpResponse.json({ token: farFutureToken(), refresh_token: refreshToken }),
    ),
  );
}

function stubData(origin: string, userId: number) {
  server.use(
    http.get(`${origin}/api/v1/me`, () => HttpResponse.json({ id: userId })),
    http.get(`${origin}/api/v1/me/community-memberships`, () =>
      HttpResponse.json({ "hydra:member": [] }),
    ),
    http.get(`${origin}/api/v1/me/pinned-communities`, () =>
      HttpResponse.json({ "hydra:member": [] }),
    ),
    http.get(`${origin}/api/v1/communities`, () => HttpResponse.json({ "hydra:member": [] })),
    http.get(`${origin}/api/v1/notifications/unread-counts`, () =>
      HttpResponse.json({ counts: {} }),
    ),
    http.get(`${origin}/api/v1/realtime/token`, () =>
      HttpResponse.json({ token: "rt-token", expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
    ),
  );
}

async function bootWithFakeBridge(identities: DesktopIdentity[], activeId: string) {
  const bridge = createFakePlatformBridge();
  for (const identity of identities) {
    await bridge.secrets.set(secretKey(PROFILE_ID, identity.id, "refreshToken"), "old");
  }
  const registry = new ConnectionRegistry(bridge);
  await registry.boot(PROFILE_ID, identities, activeId);
  return { registry, bridge };
}

beforeEach(() => {
  localStorage.clear();
  _resetNegotiationForTests();
  __resetRefreshStateForTests();
  setAccessToken(null);
});

afterEach(() => {
  setRefreshExecutor(null);
  vi.useRealTimers();
});

describe("ConnectionRegistry.boot", () => {
  it("starts one connection per identity and lists both healthy in the snapshot, in config order", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A);
    stubServerInfo(ORIGIN_B, "Beta");
    stubRefresh(ORIGIN_B);
    const identityA = makeIdentity("ia", ORIGIN_A);
    const identityB = makeIdentity("ib", ORIGIN_B);

    const { registry } = await bootWithFakeBridge([identityA, identityB], "ia");

    await vi.waitFor(() => {
      const snap = registry.getSnapshot();
      expect(snap.connections.map((a) => a.status)).toEqual(["healthy", "healthy"]);
    });

    const snapshot = registry.getSnapshot();
    expect(snapshot.connections.map((a) => a.identityId)).toEqual(["ia", "ib"]);
    expect(snapshot.connections.map((a) => a.serverName)).toEqual(["Alpha", "Beta"]);
    expect(snapshot.activeIdentityId).toBe("ia");
    expect(registry.getConnection("ia")).toBeDefined();
    expect(registry.getConnection("ib")).toBeDefined();
    expect(registry.getConnection("nope")).toBeUndefined();

    registry.stopAll();
  });

  it("resolves without waiting for the connections to become healthy", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A);
    const identityA = makeIdentity("ia", ORIGIN_A);

    const { registry } = await bootWithFakeBridge([identityA], "ia");

    expect(registry.getSnapshot().connections[0]?.status).toBe("connecting");

    await vi.waitFor(() => expect(registry.getSnapshot().connections[0]?.status).toBe("healthy"));
    registry.stopAll();
  });
});

describe("ConnectionRegistry active-identity refresh delegation", () => {
  it("routes the global refreshAccessToken() through the active connection's refreshNow()", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A, "rotated-a");
    stubServerInfo(ORIGIN_B, "Beta");
    stubRefresh(ORIGIN_B, "rotated-b");
    const identityA = makeIdentity("ia", ORIGIN_A);
    const identityB = makeIdentity("ib", ORIGIN_B);

    const { registry } = await bootWithFakeBridge([identityA, identityB], "ia");
    await vi.waitFor(() => {
      expect(registry.getSnapshot().connections.map((a) => a.status)).toEqual([
        "healthy",
        "healthy",
      ]);
    });

    setAccessToken("stale");
    const refreshed = await refreshAccessToken();
    expect(refreshed).toBe(registry.getConnection("ia")!.getAccessToken());

    registry.stopAll();
  });

  it("re-installs the executor when the active identity switches", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A, "rotated-a");
    stubServerInfo(ORIGIN_B, "Beta");
    stubRefresh(ORIGIN_B, "rotated-b");
    const identityA = makeIdentity("ia", ORIGIN_A);
    const identityB = makeIdentity("ib", ORIGIN_B);

    const { registry } = await bootWithFakeBridge([identityA, identityB], "ia");
    await vi.waitFor(() => {
      expect(registry.getSnapshot().connections.map((a) => a.status)).toEqual([
        "healthy",
        "healthy",
      ]);
    });

    registry.setActiveIdentity("ib");
    expect(registry.getSnapshot().activeIdentityId).toBe("ib");

    setAccessToken("stale");
    const refreshed = await refreshAccessToken();
    expect(refreshed).toBe(registry.getConnection("ib")!.getAccessToken());

    registry.stopAll();
  });
});

describe("ConnectionRegistry.onNotification", () => {
  it("relays notification events from any connection, tagged with that connection's identityId", async () => {
    stubServerInfo(ORIGIN_A, "Alpha", `${ORIGIN_A}/.well-known/mercure`);
    stubRefresh(ORIGIN_A);
    stubData(ORIGIN_A, 1);
    stubServerInfo(ORIGIN_B, "Beta", `${ORIGIN_B}/.well-known/mercure`);
    stubRefresh(ORIGIN_B);
    stubData(ORIGIN_B, 2);
    const identityA = makeIdentity("ia", ORIGIN_A);
    const identityB = makeIdentity("ib", ORIGIN_B);

    const { registry } = await bootWithFakeBridge([identityA, identityB], "ia");
    await vi.waitFor(() => {
      expect(registry.getSnapshot().connections.map((a) => a.status)).toEqual([
        "healthy",
        "healthy",
      ]);
    });
    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBe(2));
    const esA = getFakeEventSourceInstances().find((es) => es.url.startsWith(ORIGIN_A))!;
    const esB = getFakeEventSourceInstances().find((es) => es.url.startsWith(ORIGIN_B))!;

    const received: unknown[] = [];
    const unsubscribe = registry.onNotification((event) => received.push(event));

    const raw = {
      type: "notification",
      id: 1,
      notificationType: "mention",
      isRead: false,
      communityId: 5,
      communityIdentifier: "team",
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
    esB.dispatch(JSON.stringify(raw));

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toMatchObject({ identityId: "ib", origin: ORIGIN_B, raw });

    unsubscribe();
    esA.dispatch(JSON.stringify({ ...raw, id: 2 }));
    await vi.waitFor(() =>
      expect(registry.getSnapshot().connections[0]?.unreadCounts["5"]).toBe(1),
    );
    expect(received).toHaveLength(1);

    registry.stopAll();
  });
});

describe("ConnectionRegistry.subscribe", () => {
  it("notifies listeners and returns a cached snapshot reference until the next change", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A);
    const identityA = makeIdentity("ia", ORIGIN_A);

    const { registry } = await bootWithFakeBridge([identityA], "ia");
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    const before = registry.getSnapshot();
    expect(registry.getSnapshot()).toBe(before);

    await vi.waitFor(() => expect(registry.getSnapshot().connections[0]?.status).toBe("healthy"));
    expect(registry.getSnapshot()).not.toBe(before);
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    registry.stopAll();
  });
});

describe("ConnectionRegistry.addIdentity", () => {
  it("spawns and starts a new connection post-boot, appended to the snapshot", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A);
    const identityA = makeIdentity("ia", ORIGIN_A);

    const { registry, bridge } = await bootWithFakeBridge([identityA], "ia");
    await vi.waitFor(() => expect(registry.getSnapshot().connections[0]?.status).toBe("healthy"));

    stubServerInfo(ORIGIN_B, "Beta");
    stubRefresh(ORIGIN_B);
    const identityB = makeIdentity("ib", ORIGIN_B);
    await bridge.secrets.set(secretKey(PROFILE_ID, identityB.id, "refreshToken"), "old");

    registry.addIdentity(identityB);
    expect(registry.getSnapshot().connections.map((a) => a.identityId)).toEqual(["ia", "ib"]);

    await vi.waitFor(() => {
      expect(registry.getSnapshot().connections.map((a) => a.status)).toEqual([
        "healthy",
        "healthy",
      ]);
    });

    registry.stopAll();
  });
});

describe("ConnectionRegistry.stopAll", () => {
  it("stops every connection's timers and closes its SSE subscription", async () => {
    stubServerInfo(ORIGIN_A, "Alpha", `${ORIGIN_A}/.well-known/mercure`);
    stubRefresh(ORIGIN_A);
    stubData(ORIGIN_A, 1);
    stubServerInfo(ORIGIN_B, "Beta", `${ORIGIN_B}/.well-known/mercure`);
    stubRefresh(ORIGIN_B);
    stubData(ORIGIN_B, 2);
    const identityA = makeIdentity("ia", ORIGIN_A);
    const identityB = makeIdentity("ib", ORIGIN_B);

    const { registry } = await bootWithFakeBridge([identityA, identityB], "ia");
    await vi.waitFor(() => expect(getFakeEventSourceInstances().length).toBe(2));

    const closeSpies = getFakeEventSourceInstances().map((es) => vi.spyOn(es, "close"));
    registry.stopAll();

    for (const spy of closeSpies) expect(spy).toHaveBeenCalled();
  });

  it("clears the refresh executor and the connection map so a decommissioned identity can't serve a later refresh", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A);
    const identityA = makeIdentity("ia", ORIGIN_A);

    const { registry } = await bootWithFakeBridge([identityA], "ia");
    await vi.waitFor(() => expect(registry.getSnapshot().connections[0]?.status).toBe("healthy"));

    const connection = registry.getConnection("ia")!;
    const refreshSpy = vi.spyOn(connection, "refreshNow");

    registry.stopAll();
    expect(registry.getConnection("ia")).toBeUndefined();
    expect(registry.getSnapshot().connections).toHaveLength(0);

    setAccessToken("stale");
    await refreshAccessToken().catch(() => undefined);
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
