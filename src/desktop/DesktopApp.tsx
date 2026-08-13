import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell, router } from "@/appShell";
import { createAppQueryClient } from "@/queryClientFactory";
import { getPlatformBridge } from "@/platform/bridge";
import { AgentRegistry } from "./agents/AgentRegistry";
import { AgentsContext, type AgentsContextValue } from "./agents/AgentsContext";
import { DesktopBootstrap, type DesktopSession } from "./DesktopBootstrap";

export interface DesktopAppProps {
  renderApp?: (activeIdentityId: string) => ReactNode;
}

function clientFor(clients: Map<string, QueryClient>, identityId: string): QueryClient {
  let client = clients.get(identityId);
  if (!client) {
    client = createAppQueryClient(router);
    clients.set(identityId, client);
  }
  return client;
}

export function DesktopApp({ renderApp }: DesktopAppProps) {
  const [registry] = useState(() => new AgentRegistry(getPlatformBridge()));
  const [queryClients] = useState(() => new Map<string, QueryClient>());

  const subscribe = useCallback((listener: () => void) => registry.subscribe(listener), [registry]);
  const getSnapshot = useCallback(() => registry.getSnapshot(), [registry]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    return () => {
      registry.stopAll();
    };
  }, [registry]);

  const handleSession = useCallback(
    (session: DesktopSession) => {
      void registry.boot(session.profileId, session.identities, session.identityId);
    },
    [registry],
  );

  const switchTo = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_identityId: string): Promise<void> => {
      throw new Error("not implemented");
    },
    [],
  );

  const contextValue = useMemo<AgentsContextValue>(
    () => ({ registry, switchTo }),
    [registry, switchTo],
  );

  const activeIdentityId = snapshot.activeIdentityId;

  return (
    <DesktopBootstrap onSession={handleSession}>
      {activeIdentityId && (
        <AgentsContext.Provider value={contextValue}>
          <QueryClientProvider client={clientFor(queryClients, activeIdentityId)}>
            {renderApp ? renderApp(activeIdentityId) : <AppShell key={activeIdentityId} />}
          </QueryClientProvider>
        </AgentsContext.Provider>
      )}
    </DesktopBootstrap>
  );
}
