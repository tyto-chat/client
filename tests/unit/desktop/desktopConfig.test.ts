import { describe, expect, it } from "vitest";
import {
  addIdentity,
  createDefaultConfig,
  DuplicateServerIdentityError,
  getServerOrder,
  InvalidServerUrlError,
  loadDesktopConfig,
  normalizeServerUrl,
  removeIdentity,
  saveDesktopConfig,
  secretKey,
  setLastActiveIdentity,
  setServerOrder,
} from "@/desktop/desktopConfig";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";

const identity = (over: Partial<Parameters<typeof addIdentity>[2]> = {}) => ({
  id: "id-1",
  serverUrl: "https://chat.example.org",
  email: "a@b.c",
  userId: null,
  displayName: null,
  ...over,
});

describe("normalizeServerUrl", () => {
  it("returns origin and adds https scheme", () => {
    expect(normalizeServerUrl("chat.example.org/some/path")).toBe("https://chat.example.org");
    expect(normalizeServerUrl("https://chat.example.org:8443/")).toBe(
      "https://chat.example.org:8443",
    );
  });
  it("throws on garbage", () => {
    expect(() => normalizeServerUrl("ht tp://x")).toThrow(InvalidServerUrlError);
  });
});

describe("config reducers", () => {
  it("creates default config with one Default profile", () => {
    const cfg = createDefaultConfig();
    expect(cfg.profiles).toHaveLength(1);
    expect(cfg.profiles[0]!.name).toBe("Default");
    expect(cfg.lastActiveProfileId).toBe(cfg.profiles[0]!.id);
    expect(cfg.autoOpenLastProfile).toBe(true);
  });

  it("adds an identity and rejects a second one for the same origin", () => {
    const cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    const next = addIdentity(cfg, pid, identity());
    expect(next.profiles[0]!.identities).toHaveLength(1);
    expect(cfg.profiles[0]!.identities).toHaveLength(0);
    expect(() => addIdentity(next, pid, identity({ id: "id-2" }))).toThrow(
      DuplicateServerIdentityError,
    );
  });

  it("removes identity and clears lastActiveIdentityId when it pointed at it", () => {
    const cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    let next = addIdentity(cfg, pid, identity());
    next = setLastActiveIdentity(next, pid, "id-1");
    expect(next.profiles[0]!.lastActiveIdentityId).toBe("id-1");
    next = removeIdentity(next, pid, "id-1");
    expect(next.profiles[0]!.identities).toHaveLength(0);
    expect(next.profiles[0]!.lastActiveIdentityId).toBeNull();
  });
});

describe("persistence", () => {
  it("loads default config on empty bridge and persists it", async () => {
    const bridge = createFakePlatformBridge();
    const cfg = await loadDesktopConfig(bridge);
    expect(cfg.profiles[0]!.name).toBe("Default");
    expect(await bridge.config.get()).not.toBeNull();
  });

  it("round-trips through save/load", async () => {
    const bridge = createFakePlatformBridge();
    const base = await loadDesktopConfig(bridge);
    const cfg = addIdentity(base, base.profiles[0]!.id, identity());
    await saveDesktopConfig(bridge, cfg);
    const loaded = await loadDesktopConfig(bridge);
    expect(loaded.profiles[0]!.identities[0]!.serverUrl).toBe("https://chat.example.org");
  });

  it("falls back to default on corrupt json", async () => {
    const bridge = createFakePlatformBridge();
    await bridge.config.set("{not json");
    const cfg = await loadDesktopConfig(bridge);
    expect(cfg.version).toBe(1);
  });
});

describe("server order", () => {
  it("returns [] when unset", () => {
    const cfg = createDefaultConfig();
    expect(getServerOrder(cfg.profiles[0]!)).toEqual([]);
  });

  it("round-trips through setServerOrder without mutating the source config", () => {
    const cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    const next = setServerOrder(cfg, pid, ["ib", "ia"]);
    expect(getServerOrder(next.profiles[0]!)).toEqual(["ib", "ia"]);
    expect(getServerOrder(cfg.profiles[0]!)).toEqual([]);
  });

  it("round-trips through save/load", async () => {
    const bridge = createFakePlatformBridge();
    const base = await loadDesktopConfig(bridge);
    const pid = base.profiles[0]!.id;
    const next = setServerOrder(base, pid, ["ib", "ia"]);
    await saveDesktopConfig(bridge, next);
    const loaded = await loadDesktopConfig(bridge);
    expect(getServerOrder(loaded.profiles[0]!)).toEqual(["ib", "ia"]);
  });
});

describe("secretKey", () => {
  it("namespaces by profile and identity", () => {
    expect(secretKey("p1", "i1", "password")).toBe("p1/i1/password");
    expect(secretKey("p1", "i1", "refreshToken")).toBe("p1/i1/refreshToken");
  });
});
