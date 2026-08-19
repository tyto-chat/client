import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { buildManagerGroups, refreshIdentityData } from "@/desktop/managerData";
import { ConnectionRegistry } from "@/desktop/connections/ConnectionRegistry";
import type { RegistrySnapshot } from "@/desktop/connections/ConnectionRegistry";
import type {
  ConnectionSnapshot,
  IdentityConnection,
} from "@/desktop/connections/IdentityConnection";
import type { ServerContext } from "@/desktop/connections/identityFetch";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { secretKey, type DesktopIdentity } from "@/desktop/desktopConfig";
import { _resetNegotiationForTests } from "@/api/apiVersion";
import { __resetRefreshStateForTests } from "@/api/auth";
import { setAccessToken } from "@/api/tokenStore";

const ORIGIN_A = "https://a.example";
const ORIGIN_B = "https://b.example";
const PROFILE_ID = "p1";

function makeConnectionSnapshot(overrides: Partial<ConnectionSnapshot>): ConnectionSnapshot {
  return {
    identityId: "ia",
    status: "healthy",
    serverName: "Alpha",
    origin: ORIGIN_A,
    userId: 1,
    communities: [],
    unreadCounts: {},
    conversationActivityAt: null,
    error: null,
    ...overrides,
  };
}

function makeConnectionHandle(ctx: ServerContext): IdentityConnection {
  return { serverContext: () => ctx } as unknown as IdentityConnection;
}

function makeRegistryStub(
  connections: ConnectionSnapshot[],
  connectionHandles: Record<string, IdentityConnection> = {},
): ConnectionRegistry {
  const snapshot: RegistrySnapshot = {
    connections,
    activeIdentityId: connections[0]?.identityId ?? null,
  };
  return {
    getSnapshot: () => snapshot,
    getConnection: (id: string) => connectionHandles[id],
  } as unknown as ConnectionRegistry;
}

describe("buildManagerGroups", () => {
  it("assembles one group per connection, carrying name/origin/health/communities/ctx", () => {
    const ctxA: ServerContext = { origin: ORIGIN_A, apiVersion: "v1", getToken: () => "tok" };
    const communitiesA = [
      {
        id: 5,
        identifier: "team-alpha",
        name: "Team Alpha",
        logoUrl: null,
        accentColor: null,
        iri: null,
        member: true,
        pinned: true,
        isPrivate: false,
      },
    ];
    const snapA = makeConnectionSnapshot({
      identityId: "ia",
      serverName: "Alpha",
      origin: ORIGIN_A,
      status: "healthy",
      communities: communitiesA,
    });
    const snapB = makeConnectionSnapshot({
      identityId: "ib",
      serverName: "Beta",
      origin: ORIGIN_B,
      status: "healthy",
      communities: [],
    });
    const ctxB: ServerContext = { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "tok-b" };
    const registry = makeRegistryStub([snapA, snapB], {
      ia: makeConnectionHandle(ctxA),
      ib: makeConnectionHandle(ctxB),
    });

    const groups = buildManagerGroups(registry);

    expect(groups).toEqual([
      {
        identityId: "ia",
        serverName: "Alpha",
        origin: ORIGIN_A,
        healthy: true,
        communities: communitiesA,
        ctx: ctxA,
      },
      {
        identityId: "ib",
        serverName: "Beta",
        origin: ORIGIN_B,
        healthy: true,
        communities: [],
        ctx: ctxB,
      },
    ]);
  });

  it("still includes an unhealthy connection, with ctx null and healthy false", () => {
    const snapA = makeConnectionSnapshot({ identityId: "ia", status: "healthy" });
    const ctxA: ServerContext = { origin: ORIGIN_A, apiVersion: "v1", getToken: () => "tok" };
    const snapB = makeConnectionSnapshot({
      identityId: "ib",
      serverName: "Beta",
      origin: ORIGIN_B,
      status: "unreachable",
    });
    const ctxB: ServerContext = { origin: ORIGIN_B, apiVersion: "v1", getToken: () => null };
    const registry = makeRegistryStub([snapA, snapB], {
      ia: makeConnectionHandle(ctxA),
      ib: makeConnectionHandle(ctxB),
    });

    const groups = buildManagerGroups(registry);

    expect(groups[1]).toEqual({
      identityId: "ib",
      serverName: "Beta",
      origin: ORIGIN_B,
      healthy: false,
      communities: [],
      ctx: null,
    });
  });

  it("sets ctx null when the connection is unavailable, even if reported healthy", () => {
    const snapA = makeConnectionSnapshot({ identityId: "ia", status: "healthy" });
    const registry = makeRegistryStub([snapA], {});

    const groups = buildManagerGroups(registry);

    expect(groups[0]?.ctx).toBeNull();
  });

  it("without an order argument, keeps snapshot order", () => {
    const snapA = makeConnectionSnapshot({ identityId: "ia" });
    const snapB = makeConnectionSnapshot({ identityId: "ib", origin: ORIGIN_B });
    const registry = makeRegistryStub([snapA, snapB]);

    const groups = buildManagerGroups(registry);

    expect(groups.map((g) => g.identityId)).toEqual(["ia", "ib"]);
  });

  it("with an order argument, sorts known ids by index and appends unknown ids in snapshot order", () => {
    const snapA = makeConnectionSnapshot({ identityId: "ia" });
    const snapB = makeConnectionSnapshot({ identityId: "ib", origin: ORIGIN_B });
    const snapC = makeConnectionSnapshot({ identityId: "ic", origin: "https://c.example" });
    const registry = makeRegistryStub([snapA, snapB, snapC]);

    const groups = buildManagerGroups(registry, ["ib", "ia"]);

    expect(groups.map((g) => g.identityId)).toEqual(["ib", "ia", "ic"]);
  });
});

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

function stubServerInfo(origin: string, name: string) {
  server.use(
    http.get(`${origin}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    http.get(`${origin}/api/v1/server-info`, () =>
      HttpResponse.json({ apiUrl: `${origin}/api`, name }),
    ),
    http.post(`${origin}/api/token/refresh`, () =>
      HttpResponse.json({ token: farFutureToken(), refresh_token: "rotated" }),
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
  return registry;
}

beforeEach(() => {
  localStorage.clear();
  _resetNegotiationForTests();
  __resetRefreshStateForTests();
  setAccessToken(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("refreshIdentityData", () => {
  it("re-fetches the connection's community list, bumping the origin's request count", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    let communitiesHits = 0;
    server.use(
      http.get(`${ORIGIN_A}/api/v1/me`, () => HttpResponse.json({ id: 1 })),
      http.get(`${ORIGIN_A}/api/v1/me/community-memberships`, () =>
        HttpResponse.json({ "hydra:member": [] }),
      ),
      http.get(`${ORIGIN_A}/api/v1/me/pinned-communities`, () =>
        HttpResponse.json({ "hydra:member": [] }),
      ),
      http.get(`${ORIGIN_A}/api/v1/communities`, () => {
        communitiesHits += 1;
        return HttpResponse.json({
          "hydra:member":
            communitiesHits === 1
              ? []
              : [
                  {
                    id: 9,
                    identifier: "new-team",
                    name: "New Team",
                    logo: null,
                    accentColor: null,
                  },
                ],
        });
      }),
      http.get(`${ORIGIN_A}/api/v1/notifications/unread-counts`, () =>
        HttpResponse.json({ counts: {} }),
      ),
      http.get(`${ORIGIN_A}/api/v1/realtime/token`, () =>
        HttpResponse.json({ token: "rt-token", expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
      ),
    );
    const identity = makeIdentity("ia", ORIGIN_A);
    const registry = await bootWithFakeBridge([identity], "ia");
    await vi.waitFor(() => expect(registry.getSnapshot().connections[0]?.status).toBe("healthy"));
    await vi.waitFor(() => expect(communitiesHits).toBe(1));

    await refreshIdentityData(registry, "ia");

    expect(communitiesHits).toBe(2);
    expect(registry.getSnapshot().connections[0]?.communities).toEqual([
      {
        id: 9,
        identifier: "new-team",
        name: "New Team",
        logoUrl: null,
        accentColor: null,
        iri: null,
        member: false,
        pinned: false,
        isPrivate: false,
      },
    ]);

    registry.stopAll();
  });

  it("no-ops when the identity has no live connection", async () => {
    const bridge = createFakePlatformBridge();
    const registry = new ConnectionRegistry(bridge);

    await expect(refreshIdentityData(registry, "missing")).resolves.toBeUndefined();
  });
});
