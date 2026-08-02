import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getDesktopNotificationsEnabled } from "@/utils/desktopNotifications";
import { isPushSupported, subscribeToPush } from "@/utils/webPush";

export function useWebPush(enabled: boolean): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;

    if (getDesktopNotificationsEnabled() && isPushSupported()) {
      void subscribeToPush();
    }

    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type !== "push-navigate" || typeof data.url !== "string") return;

      const url = data.url;
      if (url.startsWith("/m/")) {
        void navigate({ to: "/m/$messageId", params: { messageId: url.slice(3) } });
      } else if (url.startsWith("/dm/")) {
        void navigate({ to: "/dm/$conversationId", params: { conversationId: url.slice(4) } });
      } else {
        void navigate({ to: "/" });
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [enabled, navigate]);
}
