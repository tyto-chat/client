import { MLS_BRIDGE_VERSION } from "@/platform/PlatformBridge";

export function isE2eeCapable(): boolean {
  const bridge = typeof window === "undefined" ? undefined : window.__TYTO_PLATFORM__;
  return bridge?.mls !== undefined && (bridge.bridgeVersion ?? 0) >= MLS_BRIDGE_VERSION;
}
