import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell, router } from "@/appShell";
import { createAppQueryClient } from "@/queryClientFactory";
import { Modal } from "@/components/Modal";
import { getPlatformBridge } from "@/platform/bridge";
import { AgentRegistry } from "./agents/AgentRegistry";
import { AgentsContext, type AgentsContextValue } from "./agents/AgentsContext";
import { AddIdentityWizard, type AddIdentityResult } from "./AddIdentityWizard";
import { DesktopBootstrap, persistWizardResult, type DesktopSession } from "./DesktopBootstrap";
import {
  loadDesktopConfig,
  saveDesktopConfig,
  setLastActiveIdentity,
  type DesktopIdentity,
} from "./desktopConfig";
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

  const pendingNavigationRef = useRef<{
    identityId: string;
    navigateTo: NonNullable<SwitchTarget["navigateTo"]>;
  } | null>(null);

  const switchTo = useCallback(
    async (identityId: string, navigateTo?: SwitchTarget["navigateTo"]): Promise<void> => {
      const pending = { identityId, navigateTo: navigateTo ?? { to: "/" } };
      pendingNavigationRef.current = pending;
      try {
        await performIdentitySwitch(registry, getPlatformBridge(), { identityId, navigateTo });
      } catch (error) {
        if (pendingNavigationRef.current === pending) pendingNavigationRef.current = null;
        throw error;
      }
    },
    [registry],
  );

  const contextValue = useMemo<AgentsContextValue>(
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
        <AgentsContext.Provider value={contextValue}>
          <QueryClientProvider client={clientFor(queryClients, activeIdentityId)}>
            {renderApp ? renderApp(activeIdentityId) : <AppShell key={activeIdentityId} />}
          </QueryClientProvider>
        </AgentsContext.Provider>
      )}
    </DesktopBootstrap>
  );
}

export interface ReloginModalProps {
  registry: AgentRegistry;
  identityId: string;
  onClose: () => void;
}

export function ReloginModal({ registry, identityId, onClose }: ReloginModalProps) {
  const { t } = useTranslation("desktop");
  const [identity, setIdentity] = useState<DesktopIdentity | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const bridge = getPlatformBridge();
      const config = await loadDesktopConfig(bridge);
      const profileId = config.lastActiveProfileId ?? config.profiles[0]?.id ?? null;
      const profile = profileId ? config.profiles.find((p) => p.id === profileId) : undefined;
      const found = profile?.identities.find((i) => i.id === identityId) ?? null;
      if (!cancelled) setIdentity(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [identityId]);

  async function handleComplete(result: AddIdentityResult, close: () => void) {
    const bridge = getPlatformBridge();
    const config = await loadDesktopConfig(bridge);
    const profileId = config.lastActiveProfileId ?? config.profiles[0]?.id ?? null;
    if (!profileId) {
      close();
      return;
    }
    const profile = config.profiles.find((p) => p.id === profileId);
    const previousActiveIdentityId = profile?.lastActiveIdentityId ?? null;

    let nextConfig = await persistWizardResult(bridge, config, profileId, result);
    if (previousActiveIdentityId && previousActiveIdentityId !== identityId) {
      nextConfig = setLastActiveIdentity(nextConfig, profileId, previousActiveIdentityId);
      await saveDesktopConfig(bridge, nextConfig);
    }

    registry.getAgent(identityId)?.retry();
    close();
  }

  if (!identity) return null;

  return (
    <Modal ariaLabel={t("relogin_title")} onClose={onClose} size="sm">
      {(close) => (
        <AddIdentityWizard
          onComplete={(result) => void handleComplete(result, close)}
          initialServerUrl={identity.serverUrl}
          initialEmail={identity.email}
          lockServer
        />
      )}
    </Modal>
  );
}
