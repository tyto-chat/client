import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { AgentRegistry, type RegistrySnapshot } from "./AgentRegistry";

export interface AgentsContextValue {
  registry: AgentRegistry;
  switchTo: (identityId: string) => Promise<void>;
}

export const AgentsContext = createContext<AgentsContextValue | null>(null);

export function useAgentsContext(): AgentsContextValue {
  const value = useContext(AgentsContext);
  if (!value) throw new Error("useAgentsContext must be used within AgentsContext.Provider");
  return value;
}

export function useAgentRegistry(): AgentRegistry {
  return useAgentsContext().registry;
}

export function useSwitchIdentity(): (identityId: string) => Promise<void> {
  return useAgentsContext().switchTo;
}

export function useAgentsSnapshot(): RegistrySnapshot {
  const registry = useAgentRegistry();
  const subscribe = useCallback((listener: () => void) => registry.subscribe(listener), [registry]);
  const getSnapshot = useCallback(() => registry.getSnapshot(), [registry]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
