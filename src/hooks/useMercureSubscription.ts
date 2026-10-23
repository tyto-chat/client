import { useEffect, useRef } from "react";
import { subscribeMercure, type MercureSubscription } from "@/api/mercure";
import { useAuthContext } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { getServerInfo } from "@/api/serverInfo";

interface Connection {
  key: string;
  token: string;
  suspended: boolean;
  subscription: MercureSubscription;
}

export function useMercureSubscription(
  topic: string | string[] | null,
  onMessage: (e: MessageEvent) => void,
  errorMessage: string,
  onReconnect?: () => void,
): void {
  const { mercureToken, mercureTokenRevokesGrants, mercureSuspended, refreshMercureToken } =
    useAuthContext();
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
      current?.subscription.close();
      connection.current = null;
      return;
    }
    if (current && current.key === key) {
      if (mercureSuspended) {
        if (!current.suspended) current.subscription.suspend();
        current.suspended = true;
        return;
      }
      if (current.token !== mercureToken || current.suspended) {
        const wasSuspended = current.suspended;
        current.token = mercureToken;
        current.suspended = false;
        if (mercureTokenRevokesGrants || wasSuspended) current.subscription.reconnect();
        else current.subscription.rollover();
      }
      return;
    }
    if (mercureSuspended) {
      current?.subscription.close();
      connection.current = null;
      return;
    }
    current?.subscription.close();
    connection.current = {
      key,
      token: mercureToken,
      suspended: false,
      subscription: subscribeMercure(
        key.split("\n"),
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
  }, [key, mercureToken, mercureTokenRevokesGrants, mercureSuspended]);

  useEffect(
    () => () => {
      connection.current?.subscription.close();
      connection.current = null;
    },
    [],
  );
}
