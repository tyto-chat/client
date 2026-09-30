import { useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { isManagedIdentityMode } from "@/platform/appMode";
import { useNotificationUnreadCounts } from "@/queries/notificationQueries";
import { ConnectionsContext } from "./connections/ConnectionsContext";
import type { RegistrySnapshot } from "./connections/ConnectionRegistry";

export function ActiveUnreadSync() {
  const connections = useContext(ConnectionsContext);
  const { data } = useNotificationUnreadCounts();

  const subscribe = useCallback(
    (listener: () => void) =>
      connections ? connections.registry.subscribe(listener) : () => undefined,
    [connections],
  );
  const getSnapshot = useCallback(
    (): RegistrySnapshot | null => connections?.registry.getSnapshot() ?? null,
    [connections],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  const activeIdentityId = snapshot?.activeIdentityId ?? null;
  const held = snapshot?.connections.find((c) => c.identityId === activeIdentityId)?.unreadCounts;
  const counts = data?.counts;
  useEffect(() => {
    if (!isManagedIdentityMode() || !connections || !activeIdentityId || !counts) return;
    connections.registry.getConnection(activeIdentityId)?.applyUnreadCounts(counts);
  }, [connections, activeIdentityId, counts, held]);

  return null;
}
