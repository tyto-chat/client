import { useEffect, useRef } from "react";
import { subscribeMercure } from "@/api/mercure";
import { useAuthContext } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { getServerInfo } from "@/api/serverInfo";
import { needsReconnect } from "@/utils/mercureGrants";

interface Connection {
  key: string;
  token: string;
  close: () => void;
}

export function useMercureSubscription(
  topic: string | string[] | null,
  onMessage: (e: MessageEvent) => void,
  errorMessage: string,
  onReconnect?: () => void,
): void {
  const { mercureToken, refreshMercureToken } = useAuthContext();
  const { notify } = useNotification();

  const latest = useRef({
    onMessage,
    onReconnect,
    refreshMercureToken,
    notify,
    errorMessage,
    mercureToken,
  });
  useEffect(() => {
    latest.current = {
      onMessage,
      onReconnect,
      refreshMercureToken,
      notify,
      errorMessage,
      mercureToken,
    };
  });

  const topics = topic === null ? [] : Array.isArray(topic) ? topic : [topic];
  const key = topics.join("\n");
  const connection = useRef<Connection | null>(null);

  useEffect(() => {
    const current = connection.current;
    if (key === "" || !mercureToken) {
      current?.close();
      connection.current = null;
      return;
    }
    const subscribed = key.split("\n");
    if (
      current &&
      current.key === key &&
      !needsReconnect(current.token, mercureToken, subscribed)
    ) {
      return;
    }
    current?.close();
    connection.current = {
      key,
      token: mercureToken,
      close: subscribeMercure(
        subscribed,
        (e) => latest.current.onMessage(e),
        () => latest.current.mercureToken,
        {
          onReconnect: () => latest.current.onReconnect?.(),
          onStaleToken: () => void latest.current.refreshMercureToken(),
          onSustainedFailure: () => latest.current.notify(latest.current.errorMessage, "error"),
        },
        getServerInfo()?.mercureUrl,
      ),
    };
  }, [key, mercureToken]);

  useEffect(
    () => () => {
      connection.current?.close();
      connection.current = null;
    },
    [],
  );
}
