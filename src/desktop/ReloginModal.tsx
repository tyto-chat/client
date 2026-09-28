import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { getPlatformBridge } from "@/platform/bridge";
import { ConnectionsContext } from "./connections/ConnectionsContext";
import type { ConnectionRegistry } from "./connections/ConnectionRegistry";
import { AddIdentityWizard, type AddIdentityResult } from "./AddIdentityWizard";
import {
  loadDesktopConfig,
  saveDesktopConfig,
  setLastActiveIdentity,
  type DesktopIdentity,
} from "./desktopConfig";
import { persistWizardResult } from "./identitySetup";

export interface ReloginModalProps {
  registry: ConnectionRegistry;
  identityId: string;
  onClose: () => void;
}

export function ReloginModal({ registry, identityId, onClose }: ReloginModalProps) {
  const { t } = useTranslation("desktop");
  const switchTo = useContext(ConnectionsContext)?.switchTo;
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

    const wasGuest = registry.getConnection(identityId)?.getSnapshot().kind === "guest";
    if (wasGuest) {
      const updated = nextConfig.profiles
        .find((p) => p.id === profileId)
        ?.identities.find((i) => i.id === identityId);
      if (updated) registry.upgradeToIdentity(updated);
      if (registry.getSnapshot().activeIdentityId === identityId) {
        void switchTo?.(identityId).catch(() => undefined);
      }
    } else {
      registry.getConnection(identityId)?.retry();
    }
    close();
  }

  if (!identity) return null;

  const isGuestWell =
    registry.getSnapshot().connections.find((c) => c.identityId === identityId)?.kind === "guest";

  return (
    <Modal
      ariaLabel={isGuestWell ? t("sign_in_to_server") : t("relogin_title")}
      onClose={onClose}
      size="sm"
    >
      {(close) => (
        <>
          <AddIdentityWizard
            onComplete={(result) => void handleComplete(result, close)}
            initialServerUrl={identity.serverUrl}
            initialEmail={identity.email}
            initialDisplayName={identity.displayName}
            initialAvatarDataUrl={identity.avatarDataUrl}
            initialAvatarColorKey={identity.avatarColorKey}
            lockServer
          />
          {!isGuestWell && (
            <button
              type="button"
              onClick={() => {
                registry.downgradeToGuestSession(identity);
                close();
              }}
              className="mt-3 w-full py-1.5 text-center text-[13px] font-medium text-fg-muted underline decoration-fg-muted/45 underline-offset-[3px] transition hover:text-fg"
              data-testid="desktop-continue-as-guest"
            >
              {t("continue_as_guest")}
            </button>
          )}
        </>
      )}
    </Modal>
  );
}
