import { beforeEach, describe, expect, it } from "vitest";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { getPlatformBridge, setPlatformBridgeForTests } from "@/platform/bridge";

describe("fakePlatformBridge", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips secrets", async () => {
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set("a", "s3cret");
    expect(await bridge.secrets.get("a")).toBe("s3cret");
    await bridge.secrets.delete("a");
    expect(await bridge.secrets.get("a")).toBeNull();
  });

  it("round-trips config json", async () => {
    const bridge = createFakePlatformBridge();
    expect(await bridge.config.get()).toBeNull();
    await bridge.config.set('{"version":1}');
    expect(await bridge.config.get()).toBe('{"version":1}');
  });

  it("persists through localStorage so a second instance sees the data", async () => {
    await createFakePlatformBridge().config.set("x");
    expect(await createFakePlatformBridge().config.get()).toBe("x");
  });
});

describe("getPlatformBridge", () => {
  beforeEach(() => setPlatformBridgeForTests(null));

  it("prefers window.__TYTO_PLATFORM__", () => {
    const injected = createFakePlatformBridge();
    window.__TYTO_PLATFORM__ = injected;
    expect(getPlatformBridge()).toBe(injected);
    delete window.__TYTO_PLATFORM__;
  });

  it("falls back to fake in test mode", () => {
    expect(getPlatformBridge()).toBeDefined();
  });

  it("honours the test override", () => {
    const fake = createFakePlatformBridge();
    setPlatformBridgeForTests(fake);
    expect(getPlatformBridge()).toBe(fake);
  });
});
