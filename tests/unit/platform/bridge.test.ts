import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { getPlatformBridge, setPlatformBridgeForTests } from "@/platform/bridge";
import { BridgeVersionError, REQUIRED_BRIDGE_VERSION } from "@/platform/PlatformBridge";

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
  beforeEach(() => {
    setPlatformBridgeForTests(null);
    delete window.__TYTO_PLATFORM__;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.__TYTO_PLATFORM__;
  });

  it("rejects a shell that declares an older bridge version", () => {
    window.__TYTO_PLATFORM__ = { ...createFakePlatformBridge(), bridgeVersion: 1 };

    let thrown: unknown;
    try {
      getPlatformBridge();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BridgeVersionError);
    expect(thrown).toMatchObject({ found: 1, required: REQUIRED_BRIDGE_VERSION });
  });

  it("keeps rejecting an outdated shell on the next call", () => {
    window.__TYTO_PLATFORM__ = { ...createFakePlatformBridge(), bridgeVersion: 1 };

    expect(() => getPlatformBridge()).toThrow(BridgeVersionError);
    expect(() => getPlatformBridge()).toThrow(BridgeVersionError);
  });

  it.each([REQUIRED_BRIDGE_VERSION, REQUIRED_BRIDGE_VERSION + 1])(
    "accepts a shell declaring bridge version %i",
    (bridgeVersion) => {
      const injected = { ...createFakePlatformBridge(), bridgeVersion };
      window.__TYTO_PLATFORM__ = injected;

      expect(getPlatformBridge()).toBe(injected);
    },
  );

  it("rejects a shell that declares no bridge version outside dev and test", () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "production");
    window.__TYTO_PLATFORM__ = createFakePlatformBridge();

    expect(() => getPlatformBridge()).toThrow(BridgeVersionError);
  });

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
