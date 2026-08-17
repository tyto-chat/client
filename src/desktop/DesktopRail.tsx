import { useCallback, useContext, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { AlertTriangleIcon, CloudOffIcon, LockIcon, PlusIcon } from "@/components/icons";
import { isManagedIdentityMode } from "@/platform/appMode";
import { getPlatformBridge } from "@/platform/bridge";
import { gradientEnd, onAccentColor } from "@/utils/accentGradient";
import { getUserColor } from "@/utils/userColor";
import { AgentsContext, type AgentsContextValue } from "./agents/AgentsContext";
import type { AgentRegistry, RegistrySnapshot } from "./agents/AgentRegistry";
import type { AgentCommunity, AgentSnapshot } from "./agents/IdentityAgent";
import { AddIdentityWizard, type AddIdentityResult } from "./AddIdentityWizard";
import { ReloginModal } from "./ReloginModal";
import { persistWizardResult } from "./identitySetup";
import { loadDesktopConfig, saveDesktopConfig, setLastActiveIdentity } from "./desktopConfig";

const DEFAULT_HEALTHY_TIMEOUT_MS = 15_000;

function waitForHealthy(
  registry: AgentRegistry,
  identityId: string,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: () => void = () => undefined;

    function settle(result: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(result);
    }

    function check() {
      const agent = registry.getSnapshot().agents.find((a) => a.identityId === identityId);
      if (!agent) return;
      if (agent.status === "healthy") settle(true);
      else if (agent.status === "auth-failed" || agent.status === "version-mismatch") settle(false);
    }

    const timer = setTimeout(() => settle(false), timeoutMs);
    unsubscribe = registry.subscribe(check);
    check();
  });
}

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

function agentCommunityTileStyle(community: AgentCommunity): React.CSSProperties {
  if (community.logoUrl) return {};
  const base = community.accentColor ?? getUserColor(community.iri ?? community.identifier);
  return {
    backgroundImage: `linear-gradient(135deg, ${base}, ${gradientEnd(base)})`,
    color: onAccentColor(base),
  };
}

function ServerStatusOverlay({
  agent,
  registry,
  onLockClick,
}: {
  agent: AgentSnapshot;
  registry: AgentRegistry;
  onLockClick: () => void;
}) {
  const { t } = useTranslation("desktop");

  if (agent.status === "auth-failed") {
    return (
      <button
        type="button"
        data-testid="desktop-server-lock"
        title={t("server_status_auth_failed")}
        onClick={(e) => {
          e.stopPropagation();
          onLockClick();
        }}
        className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rail text-warning ring-2 ring-rail"
      >
        <LockIcon size={10} />
      </button>
    );
  }

  if (agent.status === "unreachable") {
    return (
      <button
        type="button"
        data-testid="desktop-server-retry"
        title={t("server_status_unreachable")}
        onClick={(e) => {
          e.stopPropagation();
          registry.getAgent(agent.identityId)?.retry();
        }}
        className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rail text-fg-subtle ring-2 ring-rail"
      >
        <CloudOffIcon size={10} />
      </button>
    );
  }

  if (agent.status === "version-mismatch") {
    return (
      <span
        data-testid="desktop-server-incompatible"
        title={t("server_incompatible")}
        className="pointer-events-none absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rail text-danger ring-2 ring-rail"
      >
        <AlertTriangleIcon size={10} />
      </span>
    );
  }

  return null;
}

function formatHost(origin: string): string {
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    host = origin;
  }
  return host.length > 18 ? `${host.slice(0, 9)}…${host.slice(-6)}` : host;
}

function ServerCaption({ agent, showDmDot }: { agent: AgentSnapshot; showDmDot?: boolean }) {
  const name = agent.serverName ?? formatHost(agent.origin);
  const dmUnread = agent.unreadCounts["dm"] ?? 0;
  return (
    <div
      role="group"
      aria-label={name}
      title={agent.serverName ? `${agent.serverName} — ${agent.origin}` : agent.origin}
      data-testid="desktop-server-header"
      className={`flex max-w-[64px] items-center gap-1 ${
        agent.status === "connecting" ? "animate-pulse" : ""
      }`}
    >
      <span className="truncate text-[9px] font-semibold text-fg-subtle">{name}</span>
      {showDmDot && dmUnread > 0 && (
        <span
          data-testid="desktop-server-header-dm"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
        />
      )}
    </div>
  );
}

const wellClass =
  "rail-well relative flex w-[58px] shrink-0 flex-col items-center gap-2.5 rounded-[18px] px-2 py-2.5";

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

function AgentOverflowTile({
  agent,
  overflow,
  switchTo,
}: {
  agent: AgentSnapshot;
  overflow: AgentCommunity[];
  switchTo: AgentsContextValue["switchTo"];
}) {
  const disabled = agent.status !== "healthy";
  const totalUnread = overflow.reduce((sum, c) => sum + (agent.unreadCounts[String(c.id)] ?? 0), 0);
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="desktop-rail-overflow"
        title={overflow.map((c) => c.name).join(", ")}
        disabled={disabled}
        aria-disabled={disabled}
        onClick={() => {
          if (disabled) return;
          void switchTo(agent.identityId).catch(() => undefined);
        }}
        className={`flex h-[42px] w-[42px] items-center justify-center rounded-[13px] bg-surface text-fg-muted hover:bg-raised hover:text-fg ${
          disabled ? "pointer-events-none opacity-40" : ""
        }`}
      >
        <span className="text-sm font-semibold">+{overflow.length}</span>
      </button>
      {totalUnread > 0 && (
        <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[0.625rem] font-bold text-white ring-2 ring-rail">
          <span className="block cap-trim">{totalUnread > 9 ? "9+" : totalUnread}</span>
        </span>
      )}
    </div>
  );
}

function InactiveServerCommunities({
  agent,
  switchTo,
}: {
  agent: AgentSnapshot;
  switchTo: AgentsContextValue["switchTo"];
}) {
  const pinned = agent.communities.filter((c) => c.pinned);
  const overflow = agent.communities.filter((c) => !c.pinned);
  return (
    <>
      {pinned.map((community) => (
        <AgentCommunityTile
          key={community.id}
          agent={agent}
          community={community}
          switchTo={switchTo}
        />
      ))}
      {overflow.length === 1 && overflow[0] ? (
        <AgentCommunityTile
          key={overflow[0].id}
          agent={agent}
          community={overflow[0]}
          switchTo={switchTo}
        />
      ) : (
        overflow.length > 1 && (
          <AgentOverflowTile agent={agent} overflow={overflow} switchTo={switchTo} />
        )
      )}
    </>
  );
}

export function DesktopRailGroups({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation("desktop");
  const contextValue = useOptionalAgentsContext();
  const snapshot = useOptionalRegistrySnapshot(contextValue);
  const [modalOpen, setModalOpen] = useState(false);
  const [reloginIdentityId, setReloginIdentityId] = useState<string | null>(null);
  if (!isManagedIdentityMode() || !contextValue || !snapshot) return <>{children}</>;

  const hasActive = snapshot.agents.some((a) => a.identityId === snapshot.activeIdentityId);

  return (
    <>
      {!hasActive && children}
      {snapshot.agents.map((agent) => {
        const isActive = agent.identityId === snapshot.activeIdentityId;
        return (
          <div key={agent.identityId} className="flex flex-col items-center gap-1">
            <ServerCaption agent={agent} showDmDot={!isActive} />
            <div className={wellClass} data-testid={isActive ? "desktop-active-group" : undefined}>
              <ServerStatusOverlay
                agent={agent}
                registry={contextValue.registry}
                onLockClick={() => setReloginIdentityId(agent.identityId)}
              />
              {isActive ? (
                children
              ) : (
                <InactiveServerCommunities agent={agent} switchTo={contextValue.switchTo} />
              )}
            </div>
          </div>
        );
      })}
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
      {reloginIdentityId && (
        <ReloginModal
          registry={contextValue.registry}
          identityId={reloginIdentityId}
          onClose={() => setReloginIdentityId(null)}
        />
      )}
    </>
  );
}

export interface AddServerModalProps {
  registry: AgentRegistry;
  switchTo: AgentsContextValue["switchTo"];
  onClose: () => void;
  healthyTimeoutMs?: number;
}

export function AddServerModal({
  registry,
  switchTo,
  onClose,
  healthyTimeoutMs = DEFAULT_HEALTHY_TIMEOUT_MS,
}: AddServerModalProps) {
  const { t } = useTranslation("desktop");

  async function handleComplete(result: AddIdentityResult, close: () => void) {
    const bridge = getPlatformBridge();
    const config = await loadDesktopConfig(bridge);
    const profileId = config.lastActiveProfileId ?? config.profiles[0]?.id ?? null;
    if (!profileId) {
      close();
      return;
    }
    const previousActiveIdentityId =
      config.profiles.find((p) => p.id === profileId)?.lastActiveIdentityId ?? null;

    const nextConfig = await persistWizardResult(bridge, config, profileId, result);
    const profile = nextConfig.profiles.find((p) => p.id === profileId);
    const identityId = profile?.lastActiveIdentityId ?? null;

    if (identityId && !registry.getAgent(identityId)) {
      const identity = profile?.identities.find((i) => i.id === identityId);
      if (identity) registry.addIdentity(identity);
    }

    if (identityId && (await waitForHealthy(registry, identityId, healthyTimeoutMs))) {
      close();
      switchTo(identityId).catch(() => undefined);
      return;
    }

    if (previousActiveIdentityId && previousActiveIdentityId !== identityId) {
      const restored = setLastActiveIdentity(nextConfig, profileId, previousActiveIdentityId);
      await saveDesktopConfig(bridge, restored);
    }

    close();
  }

  return (
    <Modal ariaLabel={t("add_identity_title")} onClose={onClose} size="sm">
      {(close) => <AddIdentityWizard onComplete={(result) => void handleComplete(result, close)} />}
    </Modal>
  );
}
