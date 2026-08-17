import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell, router } from "@/appShell";
import { createAppQueryClient } from "@/queryClientFactory";
import { queryKeys } from "@/queries/queryKeys";
import { getPlatformBridge } from "@/platform/bridge";
import { registerIdentitySwitchHandler } from "@/platform/activeIdentity";
import { ConnectionRegistry } from "./connections/ConnectionRegistry";
import { ConnectionsContext, type ConnectionsContextValue } from "./connections/ConnectionsContext";
import { DesktopBootstrap, type DesktopSession } from "./DesktopBootstrap";
import { performIdentitySwitch, type SwitchTarget } from "./switchIdentity";

export interface DesktopAppProps {
  renderApp?: (activeIdentityId: string) => ReactNode;
}

type CacheSnapshot = { queryKey: readonly unknown[]; data: unknown; dataUpdatedAt: number }[];

function snapshotCache(client: QueryClient): CacheSnapshot {
  return client
    .getQueryCache()
    .getAll()
    .filter((q) => q.state.status === "success" && q.state.data !== undefined)
    .map((q) => ({
      queryKey: q.queryKey,
      data: q.state.data,
      dataUpdatedAt: q.state.dataUpdatedAt,
    }));
}

function hydrateCache(client: QueryClient, snapshot: CacheSnapshot): void {
  for (const entry of snapshot) {
    client.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.dataUpdatedAt });
  }
}

export function DesktopApp({ renderApp }: DesktopAppProps) {
  const [registry] = useState(() => new ConnectionRegistry(getPlatformBridge()));
  const [activeClient] = useState(() => createAppQueryClient(router));
  const [identityCaches] = useState(() => new Map<string, CacheSnapshot>());

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

  const transplantCaches = useCallback(
    (fromIdentityId: string | null, toIdentityId: string) => {
      if (fromIdentityId === toIdentityId) return;
      if (fromIdentityId) identityCaches.set(fromIdentityId, snapshotCache(activeClient));
      void activeClient.cancelQueries();
      activeClient.clear();
      const stored = identityCaches.get(toIdentityId);
      if (stored) {
        hydrateCache(activeClient, stored);
        return;
      }
      const seed = registry.getConnection(toIdentityId)?.railSeed();
      if (seed) {
        activeClient.setQueryData(queryKeys.communities(), seed.communities);
        activeClient.setQueryData(queryKeys.pinnedCommunities(), { items: seed.pinned });
        activeClient.setQueryData(queryKeys.myMemberships(), seed.memberships);
      }
    },
    [registry, activeClient, identityCaches],
  );

  const switchTo = useCallback(
    async (identityId: string, navigateTo?: SwitchTarget["navigateTo"]): Promise<void> => {
      const previousIdentityId = registry.getSnapshot().activeIdentityId;
      const pending = { identityId, navigateTo: navigateTo ?? { to: "/" } };
      pendingNavigationRef.current = pending;
      try {
        await performIdentitySwitch(registry, getPlatformBridge(), {
          identityId,
          navigateTo,
          onBeforeActivate: () => transplantCaches(previousIdentityId, identityId),
        });
      } catch (error) {
        if (pendingNavigationRef.current === pending) pendingNavigationRef.current = null;
        throw error;
      }
    },
    [registry, transplantCaches],
  );

  useEffect(() => {
    registerIdentitySwitchHandler(switchTo);
    return () => registerIdentitySwitchHandler(null);
  }, [switchTo]);

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
          <QueryClientProvider client={activeClient}>
            {renderApp ? renderApp(activeIdentityId) : <AppShell />}
          </QueryClientProvider>
        </ConnectionsContext.Provider>
      )}
    </DesktopBootstrap>
  );
}
