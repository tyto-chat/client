import { BridgeVersionError, REQUIRED_BRIDGE_VERSION, type PlatformBridge } from "./PlatformBridge";
import { createFakePlatformBridge } from "./fakePlatformBridge";

let bridge: PlatformBridge | null = null;

function isDevOrTest(): boolean {
  return Boolean(import.meta.env.DEV) || import.meta.env.MODE === "test";
}

function assertSupported(injected: PlatformBridge): void {
  const declared = injected.bridgeVersion;
  if (typeof declared !== "number") {
    if (isDevOrTest()) return;
    throw new BridgeVersionError(0, REQUIRED_BRIDGE_VERSION);
  }
  if (declared < REQUIRED_BRIDGE_VERSION) {
    throw new BridgeVersionError(declared, REQUIRED_BRIDGE_VERSION);
  }
}

export function getPlatformBridge(): PlatformBridge {
  if (bridge) return bridge;
  if (window.__TYTO_PLATFORM__) {
    assertSupported(window.__TYTO_PLATFORM__);
    bridge = window.__TYTO_PLATFORM__;
  } else if (isDevOrTest()) {
    bridge = createFakePlatformBridge();
  } else {
    throw new Error("PlatformBridge unavailable");
  }
  return bridge;
}

export function setPlatformBridgeForTests(override: PlatformBridge | null): void {
  bridge = override;
}
