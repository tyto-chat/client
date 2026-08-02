import { useEffect } from "react";
import { sendOfflineBeacon } from "@/api/presence";

export function usePresenceOfflineOnUnload(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const onPageHide = () => sendOfflineBeacon();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [enabled]);
}
