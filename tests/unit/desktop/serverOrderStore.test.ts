import { afterEach, describe, expect, it } from "vitest";
import {
  __resetServerOrderStoreForTests,
  getServerOrderSnapshot,
  persistServerOrder,
  setServerOrderSnapshot,
  subscribeServerOrder,
} from "@/desktop/serverOrderStore";
import { addIdentity, loadDesktopConfig, saveDesktopConfig } from "@/desktop/desktopConfig";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";

afterEach(() => {
  __resetServerOrderStoreForTests();
});

describe("serverOrderStore", () => {
  it("starts empty and notifies subscribers on set", () => {
    expect(getServerOrderSnapshot()).toEqual([]);
    const seen: string[][] = [];
    const unsubscribe = subscribeServerOrder(() => seen.push(getServerOrderSnapshot()));

    setServerOrderSnapshot(["ib", "ia"]);

    expect(getServerOrderSnapshot()).toEqual(["ib", "ia"]);
    expect(seen).toEqual([["ib", "ia"]]);
    unsubscribe();
  });

  it("persistServerOrder writes serverOrder onto the active profile and updates the store", async () => {
    const bridge = createFakePlatformBridge();
    let cfg = await loadDesktopConfig(bridge);
    const pid = cfg.profiles[0]!.id;
    cfg = addIdentity(cfg, pid, {
      id: "ia",
      serverUrl: "https://a.example",
      email: "a@b.c",
      userId: null,
      displayName: null,
    });
    cfg = addIdentity(cfg, pid, {
      id: "ib",
      serverUrl: "https://b.example",
      email: "b@c.d",
      userId: null,
      displayName: null,
    });
    await saveDesktopConfig(bridge, cfg);

    await persistServerOrder(bridge, ["ib", "ia"]);

    const persisted = await loadDesktopConfig(bridge);
    expect(persisted.profiles[0]!.serverOrder).toEqual(["ib", "ia"]);
    expect(getServerOrderSnapshot()).toEqual(["ib", "ia"]);
  });

  it("no-ops when there is no profile to persist against", async () => {
    const bridge = createFakePlatformBridge();
    await saveDesktopConfig(bridge, {
      version: 1,
      profiles: [],
      lastActiveProfileId: null,
      autoOpenLastProfile: true,
    });

    await expect(persistServerOrder(bridge, ["ia"])).resolves.toBeUndefined();
    expect(getServerOrderSnapshot()).toEqual([]);
  });
});
