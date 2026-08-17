import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell, router } from "@/appShell";
import { createAppQueryClient } from "@/queryClientFactory";
import { queryKeys } from "@/queries/queryKeys";
import { getPlatformBridge } from "@/platform/bridge";
import { ConnectionRegistry } from "./connections/ConnectionRegistry";
import { ConnectionsContext, type ConnectionsContextValue } from "./connections/ConnectionsContext";
import { DesktopBootstrap, type DesktopSession } from "./DesktopBootstrap";
import { performIdentitySwitch, type SwitchTarget } from "./switchIdentity";

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
  const [registry] = useState(() => new ConnectionRegistry(getPlatformBridge()));
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

  const pendingNavigationRef = useRef<{
    identityId: string;
    navigateTo: NonNullable<SwitchTarget["navigateTo"]>;
  } | null>(null);

  const switchTo = useCallback(
    async (identityId: string, navigateTo?: SwitchTarget["navigateTo"]): Promise<void> => {
      const seed = registry.getConnection(identityId)?.railSeed();
      if (seed) {
        const client = clientFor(queryClients, identityId);
        if (!client.getQueryData(queryKeys.communities())) {
          client.setQueryData(queryKeys.communities(), seed.communities);
        }
        if (!client.getQueryData(queryKeys.pinnedCommunities())) {
          client.setQueryData(queryKeys.pinnedCommunities(), { items: seed.pinned });
        }
        if (!client.getQueryData(queryKeys.myMemberships())) {
          client.setQueryData(queryKeys.myMemberships(), seed.memberships);
        }
      }
      const pending = { identityId, navigateTo: navigateTo ?? { to: "/" } };
      pendingNavigationRef.current = pending;
      try {
        await performIdentitySwitch(registry, getPlatformBridge(), { identityId, navigateTo });
      } catch (error) {
        if (pendingNavigationRef.current === pending) pendingNavigationRef.current = null;
        throw error;
      }
    },
    [registry, queryClients],
  );

  const contextValue = useMemo<ConnectionsContextValue>(
    () => ({ registry, switchTo }),
    [registry, switchTo],
  );

  const activeIdentityId = snapshot.activeIdentityId;

  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (pending && pending.identityId === activeIdentityId) {
      pendingNavigationRef.current = null;
      void router.navigate(pending.navigateTo);
    }
  }, [activeIdentityId]);

  return (
    <DesktopBootstrap onSession={handleSession}>
      {activeIdentityId && (
        <ConnectionsContext.Provider value={contextValue}>
          <QueryClientProvider client={clientFor(queryClients, activeIdentityId)}>
            {renderApp ? renderApp(activeIdentityId) : <AppShell />}
          </QueryClientProvider>
        </ConnectionsContext.Provider>
      )}
    </DesktopBootstrap>
  );
}
