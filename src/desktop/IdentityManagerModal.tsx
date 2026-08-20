import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { useConfirm } from "@/hooks/useConfirm";
import { getPlatformBridge } from "@/platform/bridge";
import { inputClass } from "@/components/authUi";
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

const FILTER_THRESHOLD = 5;

type StatusFilter = "all" | "signed-in" | "signed-out" | "problem";

const FILTERS: StatusFilter[] = ["all", "signed-in", "signed-out", "problem"];

const FILTER_LABEL = {
  all: "identity_filter_all",
  "signed-in": "identity_filter_signed_in",
  "signed-out": "identity_filter_signed_out",
  problem: "identity_filter_problem",
} as const satisfies Record<StatusFilter, string>;

interface Row {
  identity: DesktopIdentity;
  connection: ConnectionSnapshot;
  guest: boolean;
  remembered: boolean;
  problem: boolean;
  serverName: string;
}

function matchesFilter(row: Row, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "signed-out") return row.guest;
  if (filter === "problem") return row.problem;
  return !row.guest && !row.problem;
}

function matchesQuery(row: Row, query: string): boolean {
  if (!query) return true;
  const haystack = [
    row.identity.displayName ?? "",
    row.identity.email,
    row.serverName,
    row.identity.serverUrl,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
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
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

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

  const rows: Row[] = useMemo(
    () =>
      orderConnections(snapshot.connections, order).flatMap((connection) => {
        const identity = identities.find((i) => i.id === connection.identityId);
        if (!identity) return [];
        const guest = identityKind(identity) === "guest";
        return [
          {
            identity,
            connection,
            guest,
            remembered: !guest || identity.email !== "",
            problem: connection.status !== "healthy" && connection.status !== "connecting",
            serverName: connection.serverName ?? identity.serverUrl,
          },
        ];
      }),
    [snapshot.connections, order, identities],
  );

  const visible = rows.filter((row) => matchesFilter(row, filter) && matchesQuery(row, query));
  const showFilters = rows.length > FILTER_THRESHOLD;

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
    const ok = await confirm({
      title: t("remove_identity"),
      message: t("remove_identity_confirm", { server: row.serverName }),
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
          <div className="space-y-2" data-testid="identity-manager">
            {showFilters && (
              <div className="space-y-2 pb-1" data-testid="identity-filters">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("identity_search_placeholder")}
                  aria-label={t("identity_search_placeholder")}
                  className={inputClass}
                  data-testid="identity-search"
                />
                <div className="flex flex-wrap gap-1">
                  {FILTERS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      aria-pressed={filter === key}
                      data-testid={`identity-filter-${key}`}
                      className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition ${
                        filter === key
                          ? "bg-[var(--accent)]/15 text-accent-text"
                          : "text-fg-muted hover:bg-raised hover:text-fg"
                      }`}
                    >
                      {t(FILTER_LABEL[key])}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {visible.length === 0 && (
              <p className="py-6 text-center text-sm text-fg-muted">
                {rows.length === 0 ? t("identity_manager_empty") : t("identity_no_matches")}
              </p>
            )}

            {visible.map((row) => {
              const isActive = row.identity.id === snapshot.activeIdentityId;
              const busy = busyId === row.identity.id;
              return (
                <section
                  key={row.identity.id}
                  data-testid="identity-card"
                  data-identity-id={row.identity.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                    isActive ? "border-[var(--accent)]/40 bg-raised" : "border-line bg-surface"
                  }`}
                >
                  {row.remembered ? (
                    <span className={row.guest ? "grayscale-[0.7] opacity-60" : undefined}>
                      <IdentityAvatar
                        displayName={row.identity.displayName}
                        email={row.identity.email}
                        avatarDataUrl={row.identity.avatarDataUrl}
                        avatarColorKey={row.identity.avatarColorKey}
                        sizeClassName="h-9 w-9"
                        imageTestId="identity-card-avatar"
                        initialTestId="identity-card-initial"
                      />
                    </span>
                  ) : (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-raised text-sm font-bold text-fg-subtle">
                      ?
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <b
                      data-testid="identity-card-name"
                      className={`block truncate text-[13.5px] font-semibold ${
                        row.remembered ? "text-fg" : "text-fg-muted"
                      }`}
                    >
                      {row.remembered
                        ? row.identity.displayName?.trim() || row.identity.email
                        : t("identity_not_signed_in")}
                    </b>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
                      <ServerTile
                        name={row.serverName}
                        colorSeed={row.identity.serverUrl}
                        sizeClassName="h-[15px] w-[15px] text-[9px]"
                      />
                      <span className="truncate">
                        {row.remembered && row.identity.displayName?.trim()
                          ? `${row.serverName} · ${row.identity.email}`
                          : row.serverName}
                      </span>
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {isActive && (
                      <span
                        data-testid="identity-card-active"
                        className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] font-semibold text-accent-text"
                      >
                        {t("identity_active")}
                      </span>
                    )}
                    {row.guest && row.remembered && (
                      <span
                        data-testid="identity-card-signed-out"
                        className="rounded-full bg-raised px-2 py-0.5 text-[11px] font-semibold text-fg-subtle"
                      >
                        {t("identity_signed_out")}
                      </span>
                    )}
                    {row.problem && (
                      <span
                        data-testid="identity-card-problem"
                        title={t("identity_problem_hint")}
                        className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger"
                      >
                        {t("identity_filter_problem")}
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2 text-[12px] font-medium">
                    {!isActive && row.connection.status === "healthy" && (
                      <button
                        type="button"
                        data-testid="identity-switch"
                        disabled={busy}
                        onClick={() => {
                          close();
                          void switchTo(row.identity.id).catch(() => undefined);
                        }}
                        className="text-accent-text hover:underline disabled:opacity-40"
                      >
                        {t("identity_switch_to")}
                      </button>
                    )}
                    {row.guest ? (
                      <button
                        type="button"
                        data-testid="identity-sign-in"
                        disabled={busy}
                        onClick={() => setSignInIdentityId(row.identity.id)}
                        className="text-fg-muted hover:text-fg hover:underline disabled:opacity-40"
                      >
                        {t("sign_in_to_server")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid="identity-sign-out"
                        disabled={busy}
                        onClick={() => void handleSignOut(row)}
                        className="text-fg-muted hover:text-fg hover:underline disabled:opacity-40"
                      >
                        {t("sign_out_server")}
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="identity-remove"
                      disabled={busy}
                      onClick={() => void handleRemove(row, close)}
                      className="text-danger hover:underline disabled:opacity-40"
                    >
                      {t("remove_identity_short")}
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
