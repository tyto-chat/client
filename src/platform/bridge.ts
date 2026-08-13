import type { PlatformBridge } from "./PlatformBridge";
import { createFakePlatformBridge } from "./fakePlatformBridge";

let bridge: PlatformBridge | null = null;

export function getPlatformBridge(): PlatformBridge {
  if (bridge) return bridge;
  if (window.__TYTO_PLATFORM__) {
    bridge = window.__TYTO_PLATFORM__;
  } else if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    bridge = createFakePlatformBridge();
  } else {
    throw new Error("PlatformBridge unavailable");
  }
  return bridge;
}

export function setPlatformBridgeForTests(override: PlatformBridge | null): void {
  bridge = override;
}
