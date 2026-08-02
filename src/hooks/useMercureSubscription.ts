import { useEffect, useRef } from "react";
import { subscribeMercure } from "@/api/mercure";
import { useAuthContext } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { getServerInfo } from "@/api/serverInfo";

export function useMercureSubscription(
  topic: string | null,
  onMessage: (e: MessageEvent) => void,
  errorMessage: string,
  onReconnect?: () => void,
): void {
  const { mercureToken, refreshMercureToken } = useAuthContext();
  const { notify } = useNotification();

  const onMessageRef = useRef(onMessage);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onMessageRef.current = onMessage;
    onReconnectRef.current = onReconnect;
  });

  useEffect(() => {
    if (!topic || !mercureToken) return;

    return subscribeMercure(
      [topic],
      (e) => onMessageRef.current(e),
      mercureToken,
      {
        onReconnect: () => onReconnectRef.current?.(),
        onStaleToken: () => void refreshMercureToken(),
        onSustainedFailure: () => notify(errorMessage, "error"),
      },
      getServerInfo()?.mercureUrl,
    );
  }, [topic, mercureToken, refreshMercureToken, notify, errorMessage]);
}
