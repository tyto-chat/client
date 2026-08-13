/// <reference types="vite/client" />

interface Window {
  __TYTO_CONFIG__?: { serverInfoUrl?: string };
  __TYTO_PLATFORM__?: import("./platform/PlatformBridge").PlatformBridge;
}
