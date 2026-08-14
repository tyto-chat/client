import { useCallback, useContext, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { PlusIcon } from "@/components/icons";
import { isManagedIdentityMode } from "@/platform/appMode";
import { getPlatformBridge } from "@/platform/bridge";
import { gradientEnd, onAccentColor } from "@/utils/accentGradient";
import { getUserColor } from "@/utils/userColor";
import { AgentsContext, type AgentsContextValue } from "./agents/AgentsContext";
import type { AgentRegistry, RegistrySnapshot } from "./agents/AgentRegistry";
import type { AgentCommunity, AgentSnapshot } from "./agents/IdentityAgent";
import { AddIdentityWizard, type AddIdentityResult } from "./AddIdentityWizard";
import { persistWizardResult } from "./DesktopBootstrap";
import { loadDesktopConfig } from "./desktopConfig";
import { ServerTile } from "./ServerTile";

function useOptionalAgentsContext(): AgentsContextValue | null {
  return useContext(AgentsContext);
}

function useOptionalRegistrySnapshot(
  contextValue: AgentsContextValue | null,
): RegistrySnapshot | null {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!contextValue) return () => undefined;
      return contextValue.registry.subscribe(listener);
    },
    [contextValue],
  );
  const getSnapshot = useCallback(
    () => contextValue?.registry.getSnapshot() ?? null,
    [contextValue],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

function totalUnread(unreadCounts: Record<string, number>): number {
  return Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);
}

function agentCommunityTileStyle(community: AgentCommunity): React.CSSProperties {
  if (community.logoUrl) return {};
  const base = community.accentColor ?? getUserColor(community.identifier);
  return {
    backgroundImage: `linear-gradient(135deg, ${base}, ${gradientEnd(base)})`,
    color: onAccentColor(base),
  };
}

function ServerHeaderTile({ agent }: { agent: AgentSnapshot }) {
  const name = agent.serverName ?? agent.origin;
  const total = totalUnread(agent.unreadCounts);
  const dmUnread = agent.unreadCounts["dm"] ?? 0;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div aria-hidden className="h-px w-8 bg-line" />
      <div
        className="relative"
        role="group"
        aria-label={name}
        title={name}
        data-testid="desktop-server-header"
      >
        <ServerTile name={name} colorSeed={agent.origin} sizeClassName="h-7 w-7" />
        {total > 0 && (
          <span className="pointer-events-none absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[0.55rem] font-bold text-white ring-2 ring-rail">
            <span className="block cap-trim">{total > 9 ? "9+" : total}</span>
          </span>
        )}
        {dmUnread > 0 && (
          <span
            data-testid="desktop-server-header-dm"
            className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-rail"
          />
        )}
      </div>
    </div>
  );
}

function AgentCommunityTile({
  agent,
  community,
  switchTo,
}: {
  agent: AgentSnapshot;
  community: AgentCommunity;
  switchTo: AgentsContextValue["switchTo"];
}) {
  const unread = agent.unreadCounts[String(community.id)] ?? 0;
  const disabled = agent.status !== "healthy";
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="desktop-rail-community"
        title={community.name}
        disabled={disabled}
        aria-disabled={disabled}
        onClick={() => {
          if (disabled) return;
          void switchTo(agent.identityId, {
            to: "/$communityId",
            params: { communityId: community.identifier },
          }).catch(() => undefined);
        }}
        style={agentCommunityTileStyle(community)}
        className={`flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-[13px] font-bold transition-opacity hover:opacity-80 ${
          disabled ? "pointer-events-none opacity-40" : ""
        }`}
      >
        {community.logoUrl ? (
          <img
            src={community.logoUrl}
            alt={community.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="block cap-trim">{community.name.charAt(0).toUpperCase()}</span>
        )}
      </button>
      {unread > 0 && (
        <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[0.625rem] font-bold text-white ring-2 ring-rail">
          <span className="block cap-trim">{unread > 9 ? "9+" : unread}</span>
        </span>
      )}
    </div>
  );
}

export function DesktopRailActiveHeader() {
  const contextValue = useOptionalAgentsContext();
  const snapshot = useOptionalRegistrySnapshot(contextValue);
  if (!isManagedIdentityMode() || !contextValue || !snapshot) return null;

  const active = snapshot.agents.find((a) => a.identityId === snapshot.activeIdentityId);
  if (!active) return null;

  return <ServerHeaderTile agent={active} />;
}

export interface AddServerModalProps {
  registry: AgentRegistry;
  switchTo: AgentsContextValue["switchTo"];
  onClose: () => void;
}

export function AddServerModal({ registry, switchTo, onClose }: AddServerModalProps) {
  const { t } = useTranslation("desktop");

  async function handleComplete(result: AddIdentityResult, close: () => void) {
    const bridge = getPlatformBridge();
    const config = await loadDesktopConfig(bridge);
    const profileId = config.lastActiveProfileId ?? config.profiles[0]?.id ?? null;
    if (!profileId) {
      close();
      return;
    }

    const nextConfig = await persistWizardResult(bridge, config, profileId, result);
    const profile = nextConfig.profiles.find((p) => p.id === profileId);
    const identityId = profile?.lastActiveIdentityId ?? null;

    if (identityId && !registry.getAgent(identityId)) {
      const identity = profile?.identities.find((i) => i.id === identityId);
      if (identity) registry.addIdentity(identity);
    }

    close();
    if (identityId) switchTo(identityId).catch(() => undefined);
  }

  return (
    <Modal ariaLabel={t("add_identity_title")} onClose={onClose} size="sm">
      {(close) => <AddIdentityWizard onComplete={(result) => void handleComplete(result, close)} />}
    </Modal>
  );
}

export function DesktopRailOthers() {
  const { t } = useTranslation("desktop");
  const contextValue = useOptionalAgentsContext();
  const snapshot = useOptionalRegistrySnapshot(contextValue);
  const [modalOpen, setModalOpen] = useState(false);
  if (!isManagedIdentityMode() || !contextValue || !snapshot) return null;

  const others = snapshot.agents.filter((a) => a.identityId !== snapshot.activeIdentityId);

  return (
    <>
      {others.map((agent) => (
        <div key={agent.identityId} className="flex w-full flex-col items-center gap-2.5">
          <ServerHeaderTile agent={agent} />
          {agent.communities.map((community) => (
            <AgentCommunityTile
              key={community.id}
              agent={agent}
              community={community}
              switchTo={contextValue.switchTo}
            />
          ))}
        </div>
      ))}
      <button
        type="button"
        data-testid="desktop-add-server"
        title={t("add_identity_title")}
        onClick={() => setModalOpen(true)}
        className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-dashed border-line-strong text-fg-muted transition-colors hover:border-line hover:bg-raised hover:text-fg"
      >
        <PlusIcon size={16} />
      </button>
      {modalOpen && (
        <AddServerModal
          registry={contextValue.registry}
          switchTo={contextValue.switchTo}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
