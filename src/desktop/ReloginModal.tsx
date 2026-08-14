import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { getPlatformBridge } from "@/platform/bridge";
import type { AgentRegistry } from "./agents/AgentRegistry";
import { AddIdentityWizard, type AddIdentityResult } from "./AddIdentityWizard";
import {
  loadDesktopConfig,
  saveDesktopConfig,
  setLastActiveIdentity,
  type DesktopIdentity,
} from "./desktopConfig";
import { persistWizardResult } from "./identitySetup";

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
