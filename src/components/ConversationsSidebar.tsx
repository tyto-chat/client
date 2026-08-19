import { useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/Avatar";
import { avatarUrl } from "@/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotification } from "@/context/NotificationContext";
import { useConversations } from "@/queries/conversationQueries";
import { useMarkAllDmsRead } from "@/queries/readStateQueries";
import { conversationDisplayName } from "@/utils/conversationDisplayName";
import { BellOffIcon, CheckDoubleIcon, PlusIcon } from "@/components/icons";
import { useMobileNav } from "@/context/MobileNavContext";
import { cn } from "@/utils/cn";
import { isManagedIdentityMode } from "@/platform/appMode";
import {
  getIdentitySwitchTarget,
  isIdentitySwitchInProgress,
  requestIdentitySwitch,
} from "@/platform/activeIdentity";
import { getDmListRevision, subscribeDmListRevision } from "@/platform/dmListRevision";
import { hostFromOrigin, serverTileStyle } from "@/utils/serverDisplay";
import { ConversationRowsSkeleton } from "@/components/ui/Skeleton";
import { sidebarRow, sidebarRowActive, sidebarRowUnread } from "@/components/ui/styles";
import { ConnectionsContext } from "@/desktop/connections/ConnectionsContext";
import type { ConnectionRegistry } from "@/desktop/connections/ConnectionRegistry";
import {
  compareUnified,
  fetchUnifiedConversations,
  getCachedUnifiedConversations,
  type UnifiedConversation,
} from "@/desktop/unifiedDms";
import type { Conversation } from "@/types/api";

export function ConversationsSidebar() {
  const connectionsContext = useContext(ConnectionsContext);
  const desktopManaged = isManagedIdentityMode() && !!connectionsContext;

  if (desktopManaged && connectionsContext) {
    return <UnifiedConversationsSidebar registry={connectionsContext.registry} />;
  }
  return <LegacyConversationsSidebar />;
}

function LegacyConversationsSidebar() {
  const { t } = useTranslation("conversation");
  const { user } = useAuth();
  const { notify } = useNotification();
  const { data: conversations = [], isLoading } = useConversations();
  const markAllDmsRead = useMarkAllDmsRead();

  const { navOpen, closeNav } = useMobileNav();

  const params = useParams({ strict: false });
  const activeId = (params as { conversationId?: string }).conversationId;

  const overflowSuffix = (count: number) => t("compact_overflow_suffix", { count });

  const sorted = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aUnread = a.unreadCount > 0 && a.identifier !== activeId ? 1 : 0;
      const bUnread = b.unreadCount > 0 && b.identifier !== activeId ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversations, activeId]);

  function isMember(c: Conversation) {
    return c.members.find((m) => m.userId === user?.id);
  }

  function renderRow(c: Conversation) {
    const displayName = conversationDisplayName(c, user?.id, overflowSuffix);
    const isActive = c.identifier === activeId;
    const me = isMember(c);
    const isMuted = !!me?.mutedUntil;
    const unreadCount = !isActive ? c.unreadCount : 0;
    const isUnread = !isMuted && unreadCount > 0;
    const others = c.members.filter((m) => m.userId !== user?.id && m.profile);
    const first = others[0];
    return (
      <li key={c["@id"]}>
        <Link
          to="/dm/$conversationId"
          params={{ conversationId: c.identifier }}
          onClick={closeNav}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            isActive ? sidebarRowActive : isUnread ? sidebarRowUnread : sidebarRow,
            "truncate",
            isMuted && "opacity-60",
          )}
          title={displayName}
        >
          {first && (
            <span className="relative shrink-0">
              <Avatar
                name={first.profile!.name}
                colorKey={first.profile!["@id"] ?? `user:${first.userId}`}
                imageUrl={avatarUrl(first.profile!.avatar?.contentUrl ?? null)}
                size="xs"
                userId={first.userId}
              />
              {others.length > 1 && (
                <span className="absolute -bottom-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-raised px-0.5 text-[0.5625rem] font-bold text-fg-muted ring-1 ring-line">
                  {others.length}
                </span>
              )}
            </span>
          )}
          <span className="flex-1 truncate">{displayName}</span>
          {isMuted && (
            <span
              data-testid="dm-muted-indicator"
              aria-label={t("muted")}
              title={t("muted")}
              className="shrink-0"
            >
              <BellOffIcon size={12} className="text-fg-subtle" />
            </span>
          )}
          {isUnread && (
            <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-bold text-white">
              <span className="block cap-trim">{unreadCount > 9 ? "9+" : unreadCount}</span>
            </span>
          )}
        </Link>
      </li>
    );
  }

  return (
    <aside
      className={cn(
        "flex w-60 shrink-0 flex-col bg-surface px-2 pb-4",
        "max-md:fixed max-md:inset-y-0 max-md:left-16 max-md:z-40 max-md:w-[calc(100vw-4rem)] max-md:max-w-72 max-md:transition-transform",
        navOpen ? "max-md:translate-x-0" : "max-md:-translate-x-[calc(4rem+100%)]",
        "md:static md:w-60",
      )}
    >
      <div className="-mx-2 mb-2 flex items-center justify-between gap-2 border-b-2 border-[color-mix(in_srgb,var(--accent)_55%,transparent)] px-4 py-3">
        <h2 className="min-w-0 flex-1 text-[0.9375rem] font-bold text-fg">
          <span className="block cap-trim-truncate truncate">{t("direct_messages")}</span>
        </h2>
        <div className="flex h-8 items-center gap-0.5">
          <button
            type="button"
            onClick={() =>
              markAllDmsRead.mutate(undefined, {
                onSuccess: () => notify(t("mark_all_dms_read_done"), "success"),
              })
            }
            disabled={markAllDmsRead.isPending}
            title={t("mark_all_dms_read")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-raised hover:text-fg disabled:opacity-30"
          >
            <CheckDoubleIcon size={14} />
          </button>
          <Link
            to="/dm/new"
            onClick={closeNav}
            title={t("new_conversation")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-raised hover:text-fg"
          >
            <PlusIcon size={14} />
          </Link>
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {isLoading ? (
          <li>
            <ConversationRowsSkeleton />
          </li>
        ) : sorted.length === 0 ? (
          <li className="flex flex-col items-center gap-2 px-3 py-6 text-center text-xs text-fg-muted">
            <PlusIcon size={28} className="opacity-40" />
            <p className="font-medium">{t("no_conversations")}</p>
            <p className="text-[0.6875rem] opacity-80">{t("no_conversations_hint")}</p>
            <Link
              to="/dm/new"
              onClick={closeNav}
              className="mt-1 rounded-lg bg-accent-gradient px-3 py-1 text-[0.6875rem] font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
            >
              {t("new_conversation")}
            </Link>
          </li>
        ) : (
          sorted.map(renderRow)
        )}
      </ul>
    </aside>
  );
}

function ServerChipBadge({ label, origin }: { label: string; origin: string }) {
  return (
    <span
      data-testid="dm-server-chip"
      title={label}
      aria-label={label}
      style={serverTileStyle(origin || label)}
      className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-sm text-[0.5625rem] font-bold opacity-50"
    >
      <span className="block cap-trim">{label.charAt(0).toUpperCase()}</span>
    </span>
  );
}

function ComposeButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("conversation");
  return (
    <button
      type="button"
      data-testid="dm-compose-button"
      onClick={onClick}
      title={t("new_conversation")}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-raised hover:text-fg"
    >
      <PlusIcon size={14} />
    </button>
  );
}

function unifiedRefetchTrigger(snapshot: {
  connections: {
    identityId: string;
    status: string;
    conversationActivityAt: number | null;
    unreadCounts: Record<string, number>;
  }[];
}): string {
  return snapshot.connections
    .map(
      (c) =>
        `${c.identityId}:${c.status}:${c.conversationActivityAt ?? 0}:${c.unreadCounts.dm ?? 0}`,
    )
    .join("|");
}

function UnifiedConversationsSidebar({ registry }: { registry: ConnectionRegistry }) {
  const { t } = useTranslation("conversation");
  const { notify } = useNotification();
  const markAllDmsRead = useMarkAllDmsRead();
  const { navOpen, closeNav } = useMobileNav();
  const navigate = useNavigate();

  const params = useParams({ strict: false });
  const activeConversationId =
    (params as { conversationId?: string }).conversationId ??
    getIdentitySwitchTarget()?.params?.conversationId;

  const subscribe = useCallback((listener: () => void) => registry.subscribe(listener), [registry]);
  const getSnapshot = useCallback(() => registry.getSnapshot(), [registry]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const trigger = useMemo(() => unifiedRefetchTrigger(snapshot), [snapshot]);

  const revision = useSyncExternalStore(subscribeDmListRevision, getDmListRevision);
  const seeded = isIdentitySwitchInProgress() ? getCachedUnifiedConversations() : null;
  const [items, setItems] = useState<UnifiedConversation[]>(seeded ?? []);
  const [loaded, setLoaded] = useState(seeded !== null);

  useEffect(() => {
    let cancelled = false;
    void fetchUnifiedConversations(registry).then((result) => {
      if (cancelled) return;
      setItems(result);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [registry, trigger, revision]);

  const connectionInfoById = useMemo(() => {
    const map = new Map<string, { userId: number | null; origin: string }>();
    for (const c of snapshot.connections)
      map.set(c.identityId, { userId: c.userId, origin: c.origin });
    return map;
  }, [snapshot]);

  function handleComposeClick() {
    closeNav();
    void navigate({ to: "/dm/new" });
  }

  const overflowSuffix = (count: number) => t("compact_overflow_suffix", { count });

  const sorted = useMemo(() => {
    const adjusted = items.map((item) => {
      const isActiveRow =
        item.identityId === snapshot.activeIdentityId &&
        item.conversation.identifier === activeConversationId;
      if (!isActiveRow || item.conversation.unreadCount === 0) return item;
      return { ...item, conversation: { ...item.conversation, unreadCount: 0 } };
    });
    return adjusted.sort(compareUnified);
  }, [items, snapshot.activeIdentityId, activeConversationId]);

  function handleRemoteNavigate(item: UnifiedConversation) {
    void requestIdentitySwitch(item.identityId, {
      to: "/dm/$conversationId",
      params: { conversationId: item.conversation.identifier },
    });
    closeNav();
  }

  function renderRow(item: UnifiedConversation) {
    const c = item.conversation;
    const isActiveIdentity = item.identityId === snapshot.activeIdentityId;
    const isActive = isActiveIdentity && c.identifier === activeConversationId;
    const info = connectionInfoById.get(item.identityId);
    const meId = info?.userId ?? null;
    const displayName = conversationDisplayName(c, meId ?? undefined, overflowSuffix);
    const me = c.members.find((m) => m.userId === meId);
    const isMuted = !!me?.mutedUntil;
    const unreadCount = !isActive ? c.unreadCount : 0;
    const isUnread = !isMuted && unreadCount > 0;
    const others = c.members.filter((m) => m.userId !== meId && m.profile);
    const first = others[0];
    const rowClassName = cn(
      isActive ? sidebarRowActive : isUnread ? sidebarRowUnread : sidebarRow,
      "w-full truncate text-left",
      isMuted && "opacity-60",
    );

    const avatar = first && (
      <span className="relative flex shrink-0">
        <Avatar
          name={first.profile!.name}
          colorKey={first.profile!["@id"] ?? `user:${first.userId}`}
          imageUrl={avatarUrl(first.profile!.avatar?.contentUrl ?? null)}
          size="xs"
          userId={first.userId}
        />
        {others.length > 1 && (
          <span className="absolute -bottom-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-raised px-0.5 text-[0.5625rem] font-bold text-fg-muted ring-1 ring-line">
            {others.length}
          </span>
        )}
      </span>
    );

    const inner = (
      <>
        {connectionInfoById.size > 1 ? (
          <span className="relative shrink-0 pr-3.5">
            <ServerChipBadge
              label={item.serverName ?? hostFromOrigin(info?.origin ?? "")}
              origin={info?.origin ?? ""}
            />
            {avatar && (
              <span className="absolute left-3.5 top-1/2 flex -translate-y-1/2">{avatar}</span>
            )}
          </span>
        ) : (
          avatar
        )}
        <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
          <span className="truncate">{displayName}</span>
        </span>
        {isMuted && (
          <span
            data-testid="dm-muted-indicator"
            aria-label={t("muted")}
            title={t("muted")}
            className="shrink-0"
          >
            <BellOffIcon size={12} className="text-fg-subtle" />
          </span>
        )}
        {isUnread && (
          <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-bold text-white">
            <span className="block cap-trim">{unreadCount > 9 ? "9+" : unreadCount}</span>
          </span>
        )}
      </>
    );

    if (isActiveIdentity) {
      return (
        <li
          key={`${item.identityId}:${c["@id"]}`}
          data-testid="dm-row"
          data-conversation-id={c.identifier}
        >
          <Link
            to="/dm/$conversationId"
            params={{ conversationId: c.identifier }}
            onClick={closeNav}
            aria-current={isActive ? "page" : undefined}
            className={rowClassName}
            title={displayName}
          >
            {inner}
          </Link>
        </li>
      );
    }

    return (
      <li
        key={`${item.identityId}:${c["@id"]}`}
        data-testid="dm-row"
        data-conversation-id={c.identifier}
      >
        <button
          type="button"
          onClick={() => handleRemoteNavigate(item)}
          className={rowClassName}
          title={displayName}
        >
          {inner}
        </button>
      </li>
    );
  }

  return (
    <aside
      className={cn(
        "flex w-60 shrink-0 flex-col bg-surface px-2 pb-4",
        "max-md:fixed max-md:inset-y-0 max-md:left-16 max-md:z-40 max-md:w-[calc(100vw-4rem)] max-md:max-w-72 max-md:transition-transform",
        navOpen ? "max-md:translate-x-0" : "max-md:-translate-x-[calc(4rem+100%)]",
        "md:static md:w-60",
      )}
    >
      <div className="-mx-2 mb-2 flex items-center justify-between gap-2 border-b-2 border-[color-mix(in_srgb,var(--accent)_55%,transparent)] px-4 py-3">
        <h2 className="min-w-0 flex-1 text-[0.9375rem] font-bold text-fg">
          <span className="block cap-trim-truncate truncate">{t("direct_messages")}</span>
        </h2>
        <div className="flex h-8 items-center gap-0.5">
          <button
            type="button"
            onClick={() =>
              markAllDmsRead.mutate(undefined, {
                onSuccess: () => notify(t("mark_all_dms_read_done"), "success"),
              })
            }
            disabled={markAllDmsRead.isPending}
            title={t("mark_all_dms_read")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-raised hover:text-fg disabled:opacity-30"
          >
            <CheckDoubleIcon size={14} />
          </button>
          <ComposeButton onClick={handleComposeClick} />
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {!loaded ? (
          <li>
            <ConversationRowsSkeleton />
          </li>
        ) : sorted.length === 0 ? (
          <li className="flex flex-col items-center gap-2 px-3 py-6 text-center text-xs text-fg-muted">
            <PlusIcon size={28} className="opacity-40" />
            <p className="font-medium">{t("no_conversations")}</p>
            <p className="text-[0.6875rem] opacity-80">{t("no_conversations_hint")}</p>
            <Link
              to="/dm/new"
              onClick={closeNav}
              className="mt-1 rounded-lg bg-accent-gradient px-3 py-1 text-[0.6875rem] font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
            >
              {t("new_conversation")}
            </Link>
          </li>
        ) : (
          sorted.map(renderRow)
        )}
      </ul>
    </aside>
  );
}
