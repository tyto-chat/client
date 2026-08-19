import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { hashKey, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell, router } from "@/appShell";
import { createAppQueryClient } from "@/queryClientFactory";
import { queryKeys } from "@/queries/queryKeys";
import { getPlatformBridge } from "@/platform/bridge";
import {
  registerIdentityInfoProvider,
  registerIdentityRequestExecutor,
  registerIdentitySwitchHandler,
  setIdentitySwitchInProgress,
  setIdentitySwitchTarget,
} from "@/platform/activeIdentity";
import { buildUrl } from "./connections/identityFetch";
import { ConnectionRegistry } from "./connections/ConnectionRegistry";
import { ConnectionsContext, type ConnectionsContextValue } from "./connections/ConnectionsContext";
import { DesktopBootstrap, type DesktopSession } from "./DesktopBootstrap";
import { performIdentitySwitch, type SwitchTarget } from "./switchIdentity";

export interface DesktopAppProps {
  renderApp?: (activeIdentityId: string) => ReactNode;
}

type CacheSnapshot = { queryKey: readonly unknown[]; data: unknown; dataUpdatedAt: number }[];

const RAIL_QUERY_KEYS = [
  queryKeys.communities(),
  queryKeys.pinnedCommunities(),
  queryKeys.myMemberships(),
];
const RAIL_KEY_HASHES = new Set(RAIL_QUERY_KEYS.map((key) => hashKey(key)));

function snapshotCache(client: QueryClient): CacheSnapshot {
  return client
    .getQueryCache()
    .getAll()
    .filter(
      (q) =>
        RAIL_KEY_HASHES.has(q.queryHash) &&
        q.state.status === "success" &&
        q.state.data !== undefined,
    )
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
      } else {
        const seed = registry.getConnection(toIdentityId)?.railSeed();
        if (seed) {
          activeClient.setQueryData(queryKeys.communities(), seed.communities);
          activeClient.setQueryData(queryKeys.pinnedCommunities(), { items: seed.pinned });
          activeClient.setQueryData(queryKeys.myMemberships(), seed.memberships);
        }
      }
      void activeClient.invalidateQueries();
    },
    [registry, activeClient, identityCaches],
  );

  const switchTo = useCallback(
    async (identityId: string, navigateTo?: SwitchTarget["navigateTo"]): Promise<void> => {
      const previousIdentityId = registry.getSnapshot().activeIdentityId;
      if (identityId === previousIdentityId) {
        await router.navigate(navigateTo ?? { to: "/" });
        return;
      }
      const pending = { identityId, navigateTo: navigateTo ?? { to: "/" } };
      pendingNavigationRef.current = pending;
      setIdentitySwitchInProgress(true);
      setIdentitySwitchTarget(pending.navigateTo);
      let hopped = false;
      try {
        await router.navigate({ to: "/switching" });
        hopped = true;
        await performIdentitySwitch(registry, getPlatformBridge(), {
          identityId,
          navigateTo,
          onBeforeActivate: () => transplantCaches(previousIdentityId, identityId),
        });
      } catch (error) {
        if (pendingNavigationRef.current === pending) pendingNavigationRef.current = null;
        setIdentitySwitchInProgress(false);
        setIdentitySwitchTarget(null);
        if (hopped) router.history.back();
        throw error;
      }
    },
    [registry, transplantCaches],
  );

  useEffect(() => {
    registerIdentitySwitchHandler(switchTo);
    return () => registerIdentitySwitchHandler(null);
  }, [switchTo]);

  useEffect(() => {
    registerIdentityInfoProvider((identityKey) => {
      const connection = registry
        .getSnapshot()
        .connections.find((c) => c.identityId === identityKey);
      return connection ? { serverName: connection.serverName, origin: connection.origin } : null;
    });
    return () => registerIdentityInfoProvider(null);
  }, [registry]);

  useEffect(() => {
    registerIdentityRequestExecutor(async (identityKey, path, init) => {
      const connection = registry.getConnection(identityKey);
      if (!connection) return;
      const ctx = connection.serverContext();
      const url = buildUrl(ctx, path);
      const headers = new Headers(init?.headers);
      const token = ctx.getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      await fetch(url, { ...init, headers, credentials: "omit" }).catch(() => {});
    });
    return () => registerIdentityRequestExecutor(null);
  }, [registry]);

  const contextValue = useMemo<ConnectionsContextValue>(
    () => ({ registry, switchTo }),
    [registry, switchTo],
  );

  const activeIdentityId = snapshot.activeIdentityId;

  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (pending && pending.identityId === activeIdentityId) {
      pendingNavigationRef.current = null;
      void router.navigate({ ...pending.navigateTo, replace: true }).finally(() => {
        setIdentitySwitchInProgress(false);
        setIdentitySwitchTarget(null);
      });
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
