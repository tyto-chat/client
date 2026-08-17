import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { SwitchTarget } from "@/desktop/switchIdentity";
import type { ConnectionRegistry, RegistrySnapshot } from "./ConnectionRegistry";

export interface ConnectionsContextValue {
  registry: ConnectionRegistry;
  switchTo: (identityId: string, navigateTo?: SwitchTarget["navigateTo"]) => Promise<void>;
}

export const ConnectionsContext = createContext<ConnectionsContextValue | null>(null);

export function useConnectionsContext(): ConnectionsContextValue {
  const value = useContext(ConnectionsContext);
  if (!value)
    throw new Error("useConnectionsContext must be used within ConnectionsContext.Provider");
  return value;
}

export function useConnectionRegistry(): ConnectionRegistry {
  return useConnectionsContext().registry;
}

export function useSwitchIdentity(): (
  identityId: string,
  navigateTo?: SwitchTarget["navigateTo"],
) => Promise<void> {
  return useConnectionsContext().switchTo;
}

export function useConnectionsSnapshot(): RegistrySnapshot {
  const registry = useConnectionRegistry();
  const subscribe = useCallback((listener: () => void) => registry.subscribe(listener), [registry]);
  const getSnapshot = useCallback(() => registry.getSnapshot(), [registry]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
