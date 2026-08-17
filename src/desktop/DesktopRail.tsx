import { useCallback, useContext, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { AlertTriangleIcon, CloudOffIcon, LockIcon, PlusIcon } from "@/components/icons";
import { isManagedIdentityMode } from "@/platform/appMode";
import { getPlatformBridge } from "@/platform/bridge";
import { gradientEnd, onAccentColor } from "@/utils/accentGradient";
import { getUserColor } from "@/utils/userColor";
import { ConnectionsContext, type ConnectionsContextValue } from "./connections/ConnectionsContext";
import type { ConnectionRegistry, RegistrySnapshot } from "./connections/ConnectionRegistry";
import type { ConnectionCommunity, ConnectionSnapshot } from "./connections/IdentityConnection";
import { AddIdentityWizard, type AddIdentityResult } from "./AddIdentityWizard";
import { ReloginModal } from "./ReloginModal";
import { persistWizardResult } from "./identitySetup";
import { loadDesktopConfig, saveDesktopConfig, setLastActiveIdentity } from "./desktopConfig";

const DEFAULT_HEALTHY_TIMEOUT_MS = 15_000;

function waitForHealthy(
  registry: ConnectionRegistry,
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
      const connection = registry
        .getSnapshot()
        .connections.find((a) => a.identityId === identityId);
      if (!connection) return;
      if (connection.status === "healthy") settle(true);
      else if (connection.status === "auth-failed" || connection.status === "version-mismatch")
        settle(false);
    }

    const timer = setTimeout(() => settle(false), timeoutMs);
    unsubscribe = registry.subscribe(check);
    check();
  });
}

function useOptionalConnectionsContext(): ConnectionsContextValue | null {
  return useContext(ConnectionsContext);
}

function useOptionalRegistrySnapshot(
  contextValue: ConnectionsContextValue | null,
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

function connectionCommunityTileStyle(community: ConnectionCommunity): React.CSSProperties {
  if (community.logoUrl) return {};
  const base = community.accentColor ?? getUserColor(community.iri ?? community.identifier);
  return {
    backgroundImage: `linear-gradient(135deg, ${base}, ${gradientEnd(base)})`,
    color: onAccentColor(base),
  };
}

function ServerStatusOverlay({
  connection,
  registry,
  onLockClick,
}: {
  connection: ConnectionSnapshot;
  registry: ConnectionRegistry;
  onLockClick: () => void;
}) {
  const { t } = useTranslation("desktop");

  if (connection.status === "auth-failed") {
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

  if (connection.status === "unreachable") {
    return (
      <button
        type="button"
        data-testid="desktop-server-retry"
        title={t("server_status_unreachable")}
        onClick={(e) => {
          e.stopPropagation();
          registry.getConnection(connection.identityId)?.retry();
        }}
        className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rail text-fg-subtle ring-2 ring-rail"
      >
        <CloudOffIcon size={10} />
      </button>
    );
  }

  if (connection.status === "version-mismatch") {
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

function ServerCaption({
  connection,
  showDmDot,
}: {
  connection: ConnectionSnapshot;
  showDmDot?: boolean;
}) {
  const name = connection.serverName ?? formatHost(connection.origin);
  const dmUnread = connection.unreadCounts["dm"] ?? 0;
  return (
    <div
      role="group"
      aria-label={name}
      title={
        connection.serverName
          ? `${connection.serverName} — ${connection.origin}`
          : connection.origin
      }
      data-testid="desktop-server-header"
      className={`flex max-w-[64px] items-center gap-1 ${
        connection.status === "connecting" ? "animate-pulse" : ""
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

function ConnectionCommunityTile({
  connection,
  community,
  switchTo,
}: {
  connection: ConnectionSnapshot;
  community: ConnectionCommunity;
  switchTo: ConnectionsContextValue["switchTo"];
}) {
  const unread = connection.unreadCounts[String(community.id)] ?? 0;
  const disabled = connection.status !== "healthy";
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
          void switchTo(connection.identityId, {
            to: "/$communityId",
            params: { communityId: community.identifier },
          }).catch(() => undefined);
        }}
        style={connectionCommunityTileStyle(community)}
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

function ConnectionOverflowTile({
  connection,
  overflow,
  switchTo,
}: {
  connection: ConnectionSnapshot;
  overflow: ConnectionCommunity[];
  switchTo: ConnectionsContextValue["switchTo"];
}) {
  const disabled = connection.status !== "healthy";
  const totalUnread = overflow.reduce(
    (sum, c) => sum + (connection.unreadCounts[String(c.id)] ?? 0),
    0,
  );
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
          void switchTo(connection.identityId).catch(() => undefined);
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
  connection,
  switchTo,
}: {
  connection: ConnectionSnapshot;
  switchTo: ConnectionsContextValue["switchTo"];
}) {
  const pinned = connection.communities.filter((c) => c.pinned);
  const overflow = connection.communities.filter((c) => !c.pinned);
  return (
    <>
      {pinned.map((community) => (
        <ConnectionCommunityTile
          key={community.id}
          connection={connection}
          community={community}
          switchTo={switchTo}
        />
      ))}
      {overflow.length === 1 && overflow[0] ? (
        <ConnectionCommunityTile
          key={overflow[0].id}
          connection={connection}
          community={overflow[0]}
          switchTo={switchTo}
        />
      ) : (
        overflow.length > 1 && (
          <ConnectionOverflowTile connection={connection} overflow={overflow} switchTo={switchTo} />
        )
      )}
    </>
  );
}

export function DesktopRailGroups({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation("desktop");
  const contextValue = useOptionalConnectionsContext();
  const snapshot = useOptionalRegistrySnapshot(contextValue);
  const [modalOpen, setModalOpen] = useState(false);
  const [reloginIdentityId, setReloginIdentityId] = useState<string | null>(null);
  if (!isManagedIdentityMode() || !contextValue || !snapshot) return <>{children}</>;

  const hasActive = snapshot.connections.some((a) => a.identityId === snapshot.activeIdentityId);

  return (
    <>
      {!hasActive && children}
      {snapshot.connections.map((connection) => {
        const isActive = connection.identityId === snapshot.activeIdentityId;
        return (
          <div key={connection.identityId} className="flex flex-col items-center gap-1">
            <ServerCaption connection={connection} showDmDot={!isActive} />
            <div className={wellClass} data-testid={isActive ? "desktop-active-group" : undefined}>
              <ServerStatusOverlay
                connection={connection}
                registry={contextValue.registry}
                onLockClick={() => setReloginIdentityId(connection.identityId)}
              />
              {isActive ? (
                children
              ) : (
                <InactiveServerCommunities
                  connection={connection}
                  switchTo={contextValue.switchTo}
                />
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
  registry: ConnectionRegistry;
  switchTo: ConnectionsContextValue["switchTo"];
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

    if (identityId && !registry.getConnection(identityId)) {
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
