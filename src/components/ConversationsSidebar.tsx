import { useMemo } from "react";
import { Link, useParams } from "@tanstack/react-router";
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
import type { Conversation } from "@/types/api";

export function ConversationsSidebar() {
  const { t } = useTranslation("conversation");
  const { user } = useAuth();
  const { notify } = useNotification();
  const { data: conversations = [] } = useConversations();
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
          className={`flex items-center gap-2 truncate rounded px-2 py-1.5 text-sm ${
            isActive
              ? "bg-raised text-accent ring-1 ring-line shadow-sm"
              : isUnread
                ? "font-semibold text-fg hover:bg-raised"
                : "text-fg-muted hover:bg-raised"
          } ${isMuted ? "opacity-60" : ""}`}
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
        "flex w-56 shrink-0 flex-col border-r border-line bg-surface py-3",
        "max-md:fixed max-md:inset-y-0 max-md:left-16 max-md:z-40 max-md:w-[calc(100vw-4rem)] max-md:max-w-72 max-md:transition-transform",
        navOpen ? "max-md:translate-x-0" : "max-md:-translate-x-[calc(4rem+100%)]",
        "md:static md:w-56",
      )}
    >
      <div className="flex items-center justify-between px-3 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t("direct_messages")}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              markAllDmsRead.mutate(undefined, {
                onSuccess: () => notify(t("mark_all_dms_read_done"), "success"),
              })
            }
            disabled={markAllDmsRead.isPending}
            title={t("mark_all_dms_read")}
            className="rounded p-1 text-fg-muted hover:bg-raised hover:text-fg disabled:opacity-30"
          >
            <CheckDoubleIcon size={14} />
          </button>
          <Link
            to="/dm/new"
            onClick={closeNav}
            title={t("new_conversation")}
            className="rounded p-1 text-fg-muted hover:bg-raised hover:text-fg"
          >
            <PlusIcon size={14} />
          </Link>
        </div>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
        {sorted.length === 0 ? (
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
