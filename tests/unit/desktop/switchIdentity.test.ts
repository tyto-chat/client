import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { ConnectionRegistry } from "@/desktop/connections/ConnectionRegistry";
import { performIdentitySwitch } from "@/desktop/switchIdentity";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import {
  loadDesktopConfig,
  saveDesktopConfig,
  secretKey,
  createDefaultConfig,
  addIdentity,
  setLastActiveIdentity,
  type DesktopIdentity,
} from "@/desktop/desktopConfig";
import { _resetNegotiationForTests } from "@/api/apiVersion";
import { __resetRefreshStateForTests, refreshAccessToken, setRefreshExecutor } from "@/api/auth";
import { setAccessToken, getAccessToken } from "@/api/tokenStore";
import { getBaseUrl } from "@/api/client";
import { getServerInfo, setServerInfo } from "@/api/serverInfo";

const ORIGIN_A = "https://a.example";
const ORIGIN_B = "https://b.example";

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
  );
}

function stubRefresh(origin: string, refreshToken = "rotated") {
  return http.post(`${origin}/api/token/refresh`, () =>
    HttpResponse.json({ token: farFutureToken(), refresh_token: refreshToken }),
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
  let config = createDefaultConfig();
  const profileId = config.profiles[0]!.id;
  for (const identity of identities) {
    config = addIdentity(config, profileId, identity);
    await bridge.secrets.set(secretKey(profileId, identity.id, "refreshToken"), "old");
  }
  config = setLastActiveIdentity(config, profileId, activeId);
  await saveDesktopConfig(bridge, config);

  const registry = new ConnectionRegistry(bridge);
  await registry.boot(profileId, identities, activeId);
  return { registry, bridge, profileId };
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

describe("performIdentitySwitch", () => {
  it("re-points every global api seam to the target identity's origin and persists the choice", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubServerInfo(ORIGIN_B, "Beta");
    stubData(ORIGIN_A, 1);
    stubData(ORIGIN_B, 2);
    let refreshHitsB = 0;
    server.use(
      stubRefresh(ORIGIN_A, "rotated-a"),
      http.post(`${ORIGIN_B}/api/token/refresh`, () => {
        refreshHitsB += 1;
        return HttpResponse.json({ token: farFutureToken(), refresh_token: "rotated-b" });
      }),
    );
    const identityA = makeIdentity("ia", ORIGIN_A);
    const identityB = makeIdentity("ib", ORIGIN_B);

    const { registry, bridge, profileId } = await bootWithFakeBridge([identityA, identityB], "ia");
    await vi.waitFor(() => {
      expect(registry.getSnapshot().connections.map((a) => a.status)).toEqual([
        "healthy",
        "healthy",
      ]);
    });

    const connectionBTokenBeforeSwitch = registry.getConnection("ib")!.getAccessToken();

    const result = await performIdentitySwitch(registry, bridge, { identityId: "ib" });

    expect(result.token).toBe(connectionBTokenBeforeSwitch);
    expect(result.serverInfo.name).toBe("Beta");

    expect(getBaseUrl()).toBe(`${ORIGIN_B}/api`);
    expect(getServerInfo()!.name).toBe("Beta");
    expect(getAccessToken()).toBe(connectionBTokenBeforeSwitch);
    expect(registry.getSnapshot().activeIdentityId).toBe("ib");

    const persisted = await loadDesktopConfig(bridge);
    const profile = persisted.profiles.find((p) => p.id === profileId)!;
    expect(profile.lastActiveIdentityId).toBe("ib");

    const hitsBefore = refreshHitsB;
    setAccessToken("stale");
    const refreshed = await refreshAccessToken();
    expect(refreshed).not.toBe("stale");
    expect(refreshHitsB).toBe(hitsBefore + 1);

    registry.stopAll();
  });

  it("throws and leaves the globals untouched when the target connection is not healthy", async () => {
    const ORIGIN_UNREACHABLE = "https://unreachable.example";
    stubServerInfo(ORIGIN_A, "Alpha");
    stubData(ORIGIN_A, 1);
    server.use(
      stubRefresh(ORIGIN_A),
      http.get(`${ORIGIN_UNREACHABLE}/api/versions`, () => HttpResponse.error()),
    );
    const identityA = makeIdentity("ia", ORIGIN_A);
    const identityB = makeIdentity("ib", ORIGIN_UNREACHABLE);

    const { registry, bridge } = await bootWithFakeBridge([identityA, identityB], "ia");
    await vi.waitFor(() => {
      expect(registry.getConnection("ia")!.getSnapshot().status).toBe("healthy");
    });

    setServerInfo({
      name: "Alpha",
      description: "",
      apiUrl: `${ORIGIN_A}/api`,
      mercureUrl: "",
      liveKitUrl: "",
      voiceEnabled: false,
      webPushPublicKey: "",
      uploads: null,
      communities: [],
      registrationEnabled: false,
      hasTerms: false,
      hasPrivacy: false,
      requireLegalConsent: false,
      legalContactEmail: null,
      minimumAgeYears: 13,
      archivedChannelRetentionDays: 30,
      listInServerCatalogue: false,
      adminOnboardingComplete: true,
    });

    const baseUrlBefore = getBaseUrl();

    await expect(performIdentitySwitch(registry, bridge, { identityId: "ib" })).rejects.toThrow();

    expect(getBaseUrl()).toBe(baseUrlBefore);
    expect(registry.getSnapshot().activeIdentityId).toBe("ia");

    registry.stopAll();
  });

  it("rejects and leaves every global untouched when the target connection's token refresh fails mid-switch", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubServerInfo(ORIGIN_B, "Beta");
    stubData(ORIGIN_A, 1);
    stubData(ORIGIN_B, 2);
    server.use(stubRefresh(ORIGIN_A, "rotated-a"), stubRefresh(ORIGIN_B, "rotated-b"));

    const identityA = makeIdentity("ia", ORIGIN_A);
    const identityB = makeIdentity("ib", ORIGIN_B);

    const { registry, bridge, profileId } = await bootWithFakeBridge([identityA, identityB], "ia");
    await vi.waitFor(() => {
      expect(registry.getSnapshot().connections.map((a) => a.status)).toEqual([
        "healthy",
        "healthy",
      ]);
    });

    await performIdentitySwitch(registry, bridge, { identityId: "ia" });

    const baseUrlBefore = getBaseUrl();
    const serverInfoNameBefore = getServerInfo()!.name;
    const tokenBefore = getAccessToken();
    expect(baseUrlBefore).toBe(`${ORIGIN_A}/api`);
    expect(serverInfoNameBefore).toBe("Alpha");

    const connectionB = registry.getConnection("ib")!;
    const getAccessTokenSpy = vi.spyOn(connectionB, "getAccessToken").mockReturnValue(null);
    server.use(
      http.post(`${ORIGIN_B}/api/token/refresh`, () =>
        HttpResponse.json({ error: "invalid_refresh_token" }, { status: 401 }),
      ),
    );

    await expect(performIdentitySwitch(registry, bridge, { identityId: "ib" })).rejects.toThrow();

    expect(getBaseUrl()).toBe(baseUrlBefore);
    expect(getServerInfo()!.name).toBe(serverInfoNameBefore);
    expect(getAccessToken()).toBe(tokenBefore);
    expect(registry.getSnapshot().activeIdentityId).toBe("ia");

    const persisted = await loadDesktopConfig(bridge);
    const profile = persisted.profiles.find((p) => p.id === profileId)!;
    expect(profile.lastActiveIdentityId).toBe("ia");

    getAccessTokenSpy.mockRestore();
    registry.stopAll();
  });

  it("refetches unread counts for both the previous and the newly-active connection after a switch", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubServerInfo(ORIGIN_B, "Beta");
    stubData(ORIGIN_A, 1);
    stubData(ORIGIN_B, 2);
    server.use(stubRefresh(ORIGIN_A, "rotated-a"), stubRefresh(ORIGIN_B, "rotated-b"));

    const identityA = makeIdentity("ia", ORIGIN_A);
    const identityB = makeIdentity("ib", ORIGIN_B);

    const { registry, bridge } = await bootWithFakeBridge([identityA, identityB], "ia");
    await vi.waitFor(() => {
      expect(registry.getSnapshot().connections.map((a) => a.status)).toEqual([
        "healthy",
        "healthy",
      ]);
    });

    const connectionA = registry.getConnection("ia")!;
    const connectionB = registry.getConnection("ib")!;
    const refreshA = vi.spyOn(connectionA, "refreshUnreadCounts").mockResolvedValue(undefined);
    const refreshB = vi.spyOn(connectionB, "refreshUnreadCounts").mockResolvedValue(undefined);

    await performIdentitySwitch(registry, bridge, { identityId: "ib" });

    expect(refreshA).toHaveBeenCalledTimes(1);
    expect(refreshB).toHaveBeenCalledTimes(1);

    registry.stopAll();
  });

  it("refreshes the outgoing connection's rail data so its well reflects pins made while active", async () => {
    stubServerInfo(ORIGIN_A, "Alpha");
    stubServerInfo(ORIGIN_B, "Beta");
    stubData(ORIGIN_A, 1);
    stubData(ORIGIN_B, 2);
    server.use(stubRefresh(ORIGIN_A, "rotated-a"), stubRefresh(ORIGIN_B, "rotated-b"));

    const identityA = makeIdentity("ia", ORIGIN_A);
    const identityB = makeIdentity("ib", ORIGIN_B);

    const { registry, bridge } = await bootWithFakeBridge([identityA, identityB], "ia");
    await vi.waitFor(() => {
      expect(registry.getSnapshot().connections.map((a) => a.status)).toEqual([
        "healthy",
        "healthy",
      ]);
    });

    const connectionA = registry.getConnection("ia")!;
    const connectionB = registry.getConnection("ib")!;
    const railA = vi.spyOn(connectionA, "refreshRailData").mockResolvedValue(undefined);
    const railB = vi.spyOn(connectionB, "refreshRailData").mockResolvedValue(undefined);

    await performIdentitySwitch(registry, bridge, { identityId: "ib" });

    expect(railA).toHaveBeenCalledTimes(1);
    expect(railB).not.toHaveBeenCalled();

    registry.stopAll();
  });
});
