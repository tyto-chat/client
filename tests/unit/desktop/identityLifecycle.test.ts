import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { removeServer, revokeAndWipeSecrets, signOutIdentity } from "@/desktop/identityLifecycle";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import type { ConnectionRegistry } from "@/desktop/connections/ConnectionRegistry";
import {
  addIdentity,
  createDefaultConfig,
  identityKind,
  loadDesktopConfig,
  saveDesktopConfig,
  secretKey,
  setServerOrder,
  type DesktopIdentity,
} from "@/desktop/desktopConfig";

const ORIGIN = "https://lifecycle.example";
const API_BASE = `${ORIGIN}/api`;
const PROFILE_ID = "p1";

const identity: DesktopIdentity = {
  id: "i1",
  serverUrl: ORIGIN,
  email: "a@b.c",
  userId: 3,
  displayName: "Ada",
};

function registryStub(overrides: Partial<ConnectionRegistry> = {}): ConnectionRegistry {
  return {
    getConnection: () => ({ serverInfo: () => ({ apiUrl: API_BASE }) }),
    downgradeToGuestSession: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  } as unknown as ConnectionRegistry;
}

async function seedBridge(over: Partial<DesktopIdentity> = {}) {
  const bridge = createFakePlatformBridge();
  let cfg = createDefaultConfig();
  cfg = {
    ...cfg,
    profiles: [{ ...cfg.profiles[0]!, id: PROFILE_ID }],
    lastActiveProfileId: PROFILE_ID,
  };
  cfg = addIdentity(cfg, PROFILE_ID, { ...identity, ...over });
  await saveDesktopConfig(bridge, cfg);
  await bridge.secrets.set(secretKey(PROFILE_ID, "i1", "refreshToken"), "refresh-secret");
  await bridge.secrets.set(secretKey(PROFILE_ID, "i1", "password"), "password-secret");
  return bridge;
}

beforeEach(() => {
  localStorage.clear();
});

describe("revokeAndWipeSecrets", () => {
  it("posts the stored refresh token once and deletes both secrets", async () => {
    const bridge = await seedBridge();
    const bodies: unknown[] = [];
    server.use(
      http.post(`${API_BASE}/logout`, async ({ request }) => {
        bodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await revokeAndWipeSecrets(bridge, API_BASE, PROFILE_ID, "i1");

    expect(bodies).toEqual([{ refresh_token: "refresh-secret" }]);
    expect(await bridge.secrets.get(secretKey(PROFILE_ID, "i1", "refreshToken"))).toBeNull();
    expect(await bridge.secrets.get(secretKey(PROFILE_ID, "i1", "password"))).toBeNull();
  });

  it("still wipes the secrets when the revoke request fails", async () => {
    const bridge = await seedBridge();
    server.use(http.post(`${API_BASE}/logout`, () => HttpResponse.error()));

    await expect(revokeAndWipeSecrets(bridge, API_BASE, PROFILE_ID, "i1")).resolves.toBeUndefined();

    expect(await bridge.secrets.get(secretKey(PROFILE_ID, "i1", "refreshToken"))).toBeNull();
    expect(await bridge.secrets.get(secretKey(PROFILE_ID, "i1", "password"))).toBeNull();
  });

  it("skips the revoke request when no refresh token is stored", async () => {
    const bridge = createFakePlatformBridge();
    let called = false;
    server.use(
      http.post(`${API_BASE}/logout`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await revokeAndWipeSecrets(bridge, API_BASE, PROFILE_ID, "i1");

    expect(called).toBe(false);
  });
});

describe("signOutIdentity", () => {
  it("wipes secrets, flips the entry to guest, and downgrades the live connection", async () => {
    const bridge = await seedBridge();
    server.use(http.post(`${API_BASE}/logout`, () => new HttpResponse(null, { status: 204 })));
    const downgrade = vi.fn();

    await signOutIdentity(
      bridge,
      registryStub({ downgradeToGuestSession: downgrade }),
      PROFILE_ID,
      identity,
    );

    const saved = await loadDesktopConfig(bridge);
    expect(identityKind(saved.profiles[0]!.identities[0]!)).toBe("guest");
    expect(saved.profiles[0]!.identities[0]!.email).toBe("a@b.c");
    expect(await bridge.secrets.get(secretKey(PROFILE_ID, "i1", "password"))).toBeNull();
    expect(downgrade).toHaveBeenCalledWith(identity);
  });
});

describe("removeServer", () => {
  it("drops the entry, prunes the server order, and removes the connection", async () => {
    const bridge = await seedBridge();
    let cfg = await loadDesktopConfig(bridge);
    cfg = setServerOrder(cfg, PROFILE_ID, ["i1", "i2"]);
    await saveDesktopConfig(bridge, cfg);
    server.use(http.post(`${API_BASE}/logout`, () => new HttpResponse(null, { status: 204 })));
    const remove = vi.fn();

    await removeServer(bridge, registryStub({ remove }), PROFILE_ID, identity);

    const saved = await loadDesktopConfig(bridge);
    expect(saved.profiles[0]!.identities).toHaveLength(0);
    expect(saved.profiles[0]!.serverOrder).toEqual(["i2"]);
    expect(await bridge.secrets.get(secretKey(PROFILE_ID, "i1", "refreshToken"))).toBeNull();
    expect(remove).toHaveBeenCalledWith("i1");
  });

  it("falls back to the origin's api base when the connection is gone", async () => {
    const bridge = await seedBridge();
    let hit = false;
    server.use(
      http.post(`${ORIGIN}/api/logout`, () => {
        hit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await removeServer(
      bridge,
      registryStub({ getConnection: () => undefined }),
      PROFILE_ID,
      identity,
    );

    expect(hit).toBe(true);
  });
});
