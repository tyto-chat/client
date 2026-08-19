import { useCallback, useContext, useSyncExternalStore } from "react";
import { isManagedIdentityMode } from "@/platform/appMode";
import { ConnectionsContext } from "./connections/ConnectionsContext";
import type { RegistrySnapshot } from "./connections/ConnectionRegistry";

export function useOtherServersDmUnread(): number {
  const contextValue = useContext(ConnectionsContext);
  const subscribe = useCallback(
    (listener: () => void) =>
      contextValue ? contextValue.registry.subscribe(listener) : () => undefined,
    [contextValue],
  );
  const getSnapshot = useCallback(
    (): RegistrySnapshot | null => contextValue?.registry.getSnapshot() ?? null,
    [contextValue],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  if (!isManagedIdentityMode() || !snapshot) return 0;
  return snapshot.connections
    .filter((c) => c.identityId !== snapshot.activeIdentityId)
    .reduce((sum, c) => sum + (c.unreadCounts["dm"] ?? 0), 0);
}
