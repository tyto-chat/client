import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { useConfirm } from "@/hooks/useConfirm";
import { getPlatformBridge } from "@/platform/bridge";
import { connectionCommunityTileStyle } from "@/utils/serverDisplay";
import { useConnectionsContext } from "./connections/ConnectionsContext";
import type { ConnectionSnapshot } from "./connections/IdentityConnection";
import {
  getServerOrder,
  identityKind,
  loadDesktopConfig,
  type DesktopIdentity,
} from "./desktopConfig";
import { removeServer, signOutIdentity } from "./identityLifecycle";
import { IdentityAvatar } from "./IdentityAvatar";
import { ReloginModal } from "./ReloginModal";
import { ServerTile } from "./ServerTile";
import { orderConnections } from "./managerData";

interface Row {
  identity: DesktopIdentity;
  connection: ConnectionSnapshot;
}

export function IdentityManagerModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("desktop");
  const { registry, switchTo } = useConnectionsContext();
  const { confirm, confirmDialog } = useConfirm();
  const subscribe = useCallback((listener: () => void) => registry.subscribe(listener), [registry]);
  const getSnapshot = useCallback(() => registry.getSnapshot(), [registry]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [identities, setIdentities] = useState<DesktopIdentity[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [signInIdentityId, setSignInIdentityId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const config = await loadDesktopConfig(getPlatformBridge());
      if (cancelled) return;
      const id = config.lastActiveProfileId ?? config.profiles[0]?.id ?? null;
      const profile = id ? config.profiles.find((p) => p.id === id) : undefined;
      setProfileId(id);
      setIdentities(profile?.identities ?? []);
      setOrder(profile ? getServerOrder(profile) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [generation]);

  const ordered = orderConnections(snapshot.connections, order);
  const rows: Row[] = ordered.flatMap((connection) => {
    const identity = identities.find((i) => i.id === connection.identityId);
    return identity ? [{ connection, identity }] : [];
  });

  async function handleSignOut(row: Row) {
    if (!profileId) return;
    setBusyId(row.identity.id);
    try {
      await signOutIdentity(getPlatformBridge(), registry, profileId, row.identity);
      setGeneration((n) => n + 1);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(row: Row, close: () => void) {
    if (!profileId) return;
    const server = row.connection.serverName ?? row.identity.serverUrl;
    const ok = await confirm({
      title: t("remove_identity"),
      message: t("remove_identity_confirm", { server }),
      confirmLabel: t("remove_identity"),
      destructive: true,
    });
    if (!ok) return;
    setBusyId(row.identity.id);
    try {
      const wasActive = row.identity.id === registry.getSnapshot().activeIdentityId;
      await removeServer(getPlatformBridge(), registry, profileId, row.identity);
      setGeneration((n) => n + 1);
      if (!wasActive) return;
      const next = registry.getSnapshot().connections[0];
      if (next) {
        close();
        void switchTo(next.identityId).catch(() => undefined);
      } else {
        window.location.replace("/");
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Modal
        ariaLabel={t("identity_manager_title")}
        title={t("identity_manager_title")}
        onClose={onClose}
        size="lg"
      >
        {(close) => (
          <div className="space-y-3" data-testid="identity-manager">
            {rows.length === 0 && (
              <p className="py-6 text-center text-sm text-fg-muted">
                {t("identity_manager_empty")}
              </p>
            )}
            {rows.map((row) => {
              const isActive = row.identity.id === snapshot.activeIdentityId;
              const guest = identityKind(row.identity) === "guest";
              const busy = busyId === row.identity.id;
              const remembered = !guest || row.identity.email !== "";
              const serverName = row.connection.serverName ?? row.identity.serverUrl;
              const pinned = row.connection.communities.filter((c) => c.pinned);
              return (
                <section
                  key={row.identity.id}
                  data-testid="identity-card"
                  data-identity-id={row.identity.id}
                  className={`rounded-xl border p-4 ${
                    isActive ? "border-[var(--accent)]/40 bg-raised" : "border-line bg-surface"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {guest && !remembered ? (
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-raised text-[17px] font-bold text-fg-subtle">
                        ?
                      </span>
                    ) : (
                      <span className={guest ? "grayscale-[0.7] opacity-60" : undefined}>
                        <IdentityAvatar
                          displayName={row.identity.displayName}
                          email={row.identity.email}
                          avatarDataUrl={row.identity.avatarDataUrl}
                          avatarColorKey={row.identity.avatarColorKey}
                          imageTestId="identity-card-avatar"
                          initialTestId="identity-card-initial"
                        />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <b
                          data-testid="identity-card-name"
                          className={`min-w-0 truncate text-[14.5px] font-semibold ${
                            guest && !remembered ? "text-fg-muted" : "text-fg"
                          }`}
                        >
                          {remembered
                            ? row.identity.displayName?.trim() || row.identity.email
                            : t("identity_not_signed_in")}
                        </b>
                        {guest && remembered && (
                          <span
                            data-testid="identity-card-signed-out"
                            className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[11px] font-semibold text-fg-subtle"
                          >
                            {t("identity_signed_out")}
                          </span>
                        )}
                      </div>
                      {remembered && row.identity.displayName?.trim() && (
                        <span className="block truncate text-xs text-fg-muted">
                          {row.identity.email}
                        </span>
                      )}
                    </div>
                    {isActive && (
                      <span
                        data-testid="identity-card-active"
                        className="shrink-0 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] font-semibold text-accent-text"
                      >
                        {t("identity_active")}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-line bg-overlay px-3 py-2">
                    <ServerTile name={serverName} colorSeed={row.identity.serverUrl} />
                    <span className="min-w-0">
                      <b className="block truncate text-[13px] font-semibold text-fg">
                        {serverName}
                      </b>
                      <span className="block truncate font-mono text-[11px] text-fg-subtle">
                        {row.identity.serverUrl}
                      </span>
                    </span>
                  </div>

                  {pinned.length > 0 && (
                    <ul
                      className="mt-2 flex flex-wrap gap-1.5"
                      data-testid="identity-card-communities"
                    >
                      {pinned.map((community) => (
                        <li key={community.id}>
                          <span
                            title={community.name}
                            style={connectionCommunityTileStyle(community)}
                            className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-[10px] text-xs font-bold"
                          >
                            {community.logoUrl ? (
                              <img
                                src={community.logoUrl}
                                alt={community.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="block cap-trim">
                                {community.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!isActive && row.connection.status === "healthy" && (
                      <button
                        type="button"
                        data-testid="identity-switch"
                        disabled={busy}
                        onClick={() => {
                          close();
                          void switchTo(row.identity.id).catch(() => undefined);
                        }}
                        className="rounded-md bg-accent-gradient px-3 py-1.5 text-[13px] font-semibold text-on-accent transition hover:opacity-90 disabled:opacity-40"
                      >
                        {t("identity_switch_to")}
                      </button>
                    )}
                    {guest ? (
                      <button
                        type="button"
                        data-testid="identity-sign-in"
                        disabled={busy}
                        onClick={() => setSignInIdentityId(row.identity.id)}
                        className="rounded-md border border-line px-3 py-1.5 text-[13px] font-medium text-fg transition hover:bg-raised disabled:opacity-40"
                      >
                        {t("sign_in_to_server")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid="identity-sign-out"
                        disabled={busy}
                        onClick={() => void handleSignOut(row)}
                        className="rounded-md border border-line px-3 py-1.5 text-[13px] font-medium text-fg transition hover:bg-raised disabled:opacity-40"
                      >
                        {t("sign_out_server")}
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="identity-remove"
                      disabled={busy}
                      onClick={() => void handleRemove(row, close)}
                      className="rounded-md border border-danger/40 px-3 py-1.5 text-[13px] font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
                    >
                      {t("remove_identity")}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Modal>
      {confirmDialog}
      {signInIdentityId && (
        <ReloginModal
          registry={registry}
          identityId={signInIdentityId}
          onClose={() => {
            setSignInIdentityId(null);
            setGeneration((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
