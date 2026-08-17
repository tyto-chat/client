import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { getFakeEventSourceInstances } from "../../mocks/EventSource";
import { AgentRegistry } from "@/desktop/agents/AgentRegistry";
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
  const registry = new AgentRegistry(bridge);
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

describe("AgentRegistry.boot", () => {
  it("starts one agent per identity and lists both healthy in the snapshot, in config order", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A);
    stubServerInfo(ORIGIN_B, "Beta");
    stubRefresh(ORIGIN_B);
    const identityA = makeIdentity("ia", ORIGIN_A);
    const identityB = makeIdentity("ib", ORIGIN_B);

    const { registry } = await bootWithFakeBridge([identityA, identityB], "ia");

    await vi.waitFor(() => {
      const snap = registry.getSnapshot();
      expect(snap.agents.map((a) => a.status)).toEqual(["healthy", "healthy"]);
    });

    const snapshot = registry.getSnapshot();
    expect(snapshot.agents.map((a) => a.identityId)).toEqual(["ia", "ib"]);
    expect(snapshot.agents.map((a) => a.serverName)).toEqual(["Alpha", "Beta"]);
    expect(snapshot.activeIdentityId).toBe("ia");
    expect(registry.getAgent("ia")).toBeDefined();
    expect(registry.getAgent("ib")).toBeDefined();
    expect(registry.getAgent("nope")).toBeUndefined();

    registry.stopAll();
  });

  it("resolves without waiting for the agents to become healthy", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A);
    const identityA = makeIdentity("ia", ORIGIN_A);

    const { registry } = await bootWithFakeBridge([identityA], "ia");

    expect(registry.getSnapshot().agents[0]?.status).toBe("connecting");

    await vi.waitFor(() => expect(registry.getSnapshot().agents[0]?.status).toBe("healthy"));
    registry.stopAll();
  });
});

describe("AgentRegistry active-identity refresh delegation", () => {
  it("routes the global refreshAccessToken() through the active agent's refreshNow()", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A, "rotated-a");
    stubServerInfo(ORIGIN_B, "Beta");
    stubRefresh(ORIGIN_B, "rotated-b");
    const identityA = makeIdentity("ia", ORIGIN_A);
    const identityB = makeIdentity("ib", ORIGIN_B);

    const { registry } = await bootWithFakeBridge([identityA, identityB], "ia");
    await vi.waitFor(() => {
      expect(registry.getSnapshot().agents.map((a) => a.status)).toEqual(["healthy", "healthy"]);
    });

    setAccessToken("stale");
    const refreshed = await refreshAccessToken();
    expect(refreshed).toBe(registry.getAgent("ia")!.getAccessToken());

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
      expect(registry.getSnapshot().agents.map((a) => a.status)).toEqual(["healthy", "healthy"]);
    });

    registry.setActiveIdentity("ib");
    expect(registry.getSnapshot().activeIdentityId).toBe("ib");

    setAccessToken("stale");
    const refreshed = await refreshAccessToken();
    expect(refreshed).toBe(registry.getAgent("ib")!.getAccessToken());

    registry.stopAll();
  });
});

describe("AgentRegistry.onNotification", () => {
  it("relays notification events from any agent, tagged with that agent's identityId", async () => {
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
      expect(registry.getSnapshot().agents.map((a) => a.status)).toEqual(["healthy", "healthy"]);
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
    await vi.waitFor(() => expect(registry.getSnapshot().agents[0]?.unreadCounts["5"]).toBe(1));
    expect(received).toHaveLength(1);

    registry.stopAll();
  });
});

describe("AgentRegistry.subscribe", () => {
  it("notifies listeners and returns a cached snapshot reference until the next change", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A);
    const identityA = makeIdentity("ia", ORIGIN_A);

    const { registry } = await bootWithFakeBridge([identityA], "ia");
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    const before = registry.getSnapshot();
    expect(registry.getSnapshot()).toBe(before);

    await vi.waitFor(() => expect(registry.getSnapshot().agents[0]?.status).toBe("healthy"));
    expect(registry.getSnapshot()).not.toBe(before);
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    registry.stopAll();
  });
});

describe("AgentRegistry.addIdentity", () => {
  it("spawns and starts a new agent post-boot, appended to the snapshot", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A);
    const identityA = makeIdentity("ia", ORIGIN_A);

    const { registry, bridge } = await bootWithFakeBridge([identityA], "ia");
    await vi.waitFor(() => expect(registry.getSnapshot().agents[0]?.status).toBe("healthy"));

    stubServerInfo(ORIGIN_B, "Beta");
    stubRefresh(ORIGIN_B);
    const identityB = makeIdentity("ib", ORIGIN_B);
    await bridge.secrets.set(secretKey(PROFILE_ID, identityB.id, "refreshToken"), "old");

    registry.addIdentity(identityB);
    expect(registry.getSnapshot().agents.map((a) => a.identityId)).toEqual(["ia", "ib"]);

    await vi.waitFor(() => {
      expect(registry.getSnapshot().agents.map((a) => a.status)).toEqual(["healthy", "healthy"]);
    });

    registry.stopAll();
  });
});

describe("AgentRegistry.stopAll", () => {
  it("stops every agent's timers and closes its SSE subscription", async () => {
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

  it("clears the refresh executor and the agent map so a decommissioned identity can't serve a later refresh", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubRefresh(ORIGIN_A);
    const identityA = makeIdentity("ia", ORIGIN_A);

    const { registry } = await bootWithFakeBridge([identityA], "ia");
    await vi.waitFor(() => expect(registry.getSnapshot().agents[0]?.status).toBe("healthy"));

    const agent = registry.getAgent("ia")!;
    const refreshSpy = vi.spyOn(agent, "refreshNow");

    registry.stopAll();
    expect(registry.getAgent("ia")).toBeUndefined();
    expect(registry.getSnapshot().agents).toHaveLength(0);

    setAccessToken("stale");
    await refreshAccessToken().catch(() => undefined);
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
