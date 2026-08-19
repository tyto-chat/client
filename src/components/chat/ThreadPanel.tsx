import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uuidFromIri } from "@/api/hydra";
import { useTranslation } from "react-i18next";
import { MessageGroup } from "@/components/chat/MessageGroup";
import { MessageEditor } from "@/components/chat/MessageEditor";
import { XIcon, Spinner, ReplyIcon } from "@/components/icons";
import { ThreadRepliesSkeleton } from "@/components/ui/Skeleton";
import { useAuthContext } from "@/context/AuthContext";
import { useTimezone } from "@/context/TimezoneContext";
import { useMessage } from "@/queries/messageQueries";
import { useToggleThreadReaction } from "@/queries/reactionQueries";
import {
  THREAD_PAGE_SIZE,
  useDeleteThreadReply,
  useEditThreadReply,
  useLoadEarlierReplies,
  useReplyToMessage,
  useThreadReplies,
} from "@/queries/threadQueries";
import { useThreadMercure } from "@/hooks/useMercure";
import { groupMessages } from "@/utils/messageGroups";
import { queryKeys } from "@/queries/queryKeys";
import type { MemberItem } from "@/utils/userMentionExtension";
import type { UserGroup } from "@/types/api";

const EMPTY_MODS: Set<number> = new Set();
const EMPTY_GROUPS: Map<number, UserGroup[]> = new Map();
const noop = (): void => {};

interface MentionableChannel {
  name: string;
  identifier: string;
}

interface Props {
  communityId?: string;
  channelIdentifier?: string;
  conversationIdentifier?: string;
  rootIri: string;
  members: MemberItem[];
  channels: MentionableChannel[];
  allowAttachments: boolean;
  canModerate?: boolean;
  onViewReplyHistory?: (messageIri: string) => void;
  canEmbed?: boolean;
  onEmbedMessage?: (messageIri: string) => void;
  onClose: () => void;
  focusReplyId?: string | null;
  onReplyFocusComplete?: () => void;
  frozen?: boolean;
  canParticipate?: boolean;
}

export function ThreadPanel({
  communityId,
  channelIdentifier,
  conversationIdentifier,
  rootIri,
  members,
  channels,
  allowAttachments,
  canModerate = false,
  onViewReplyHistory,
  canEmbed = false,
  onEmbedMessage,
  onClose,
  focusReplyId = null,
  onReplyFocusComplete,
  frozen = false,
  canParticipate = true,
}: Props) {
  const { t } = useTranslation(["channel", "common"]);
  const { user } = useAuthContext();
  const { timezone } = useTimezone();

  const rootUuid = uuidFromIri(rootIri);
  const containerIri =
    communityId != null && channelIdentifier != null
      ? `/api/communities/${communityId}/channels/${channelIdentifier}`
      : conversationIdentifier != null
        ? `/api/conversations/${conversationIdentifier}`
        : null;
  const threadTopic = containerIri ? `${containerIri}/messages/${rootUuid}/thread` : null;
  const { data: root } = useMessage(rootUuid);
  const { data: replies, isLoading } = useThreadReplies(rootIri);
  useThreadMercure(rootIri, threadTopic);

  const pagesKey =
    conversationIdentifier != null
      ? queryKeys.conversationPages(conversationIdentifier)
      : queryKeys.channelPages(communityId ?? "", channelIdentifier ?? "");

  const reply = useReplyToMessage(pagesKey, rootIri, user ?? null);
  const toggleReplyReaction = useToggleThreadReaction(rootIri, user?.id ?? 0);
  const editReply = useEditThreadReply(rootIri);
  const deleteReply = useDeleteThreadReply(rootIri);
  const handleToggleReplyReaction = useCallback(
    (messageIri: string, emoji: string, existingId?: number) =>
      toggleReplyReaction.mutate({ messageIri, emoji, existingId }),
    [toggleReplyReaction],
  );
  const handleEditReply = useCallback(
    (messageIri: string, text: string) => editReply.mutate({ messageIri, text }),
    [editReply],
  );
  const handleDeleteReply = useCallback(
    (messageIri: string) => deleteReply.mutate(messageIri),
    [deleteReply],
  );

  const loadEarlier = useLoadEarlierReplies(rootIri);
  const [noEarlier, setNoEarlier] = useState(false);
  const [noEarlierRootIri, setNoEarlierRootIri] = useState(rootIri);
  if (rootIri !== noEarlierRootIri) {
    setNoEarlierRootIri(rootIri);
    setNoEarlier(false);
  }

  const maybeHasEarlier = !noEarlier && (replies?.length ?? 0) >= THREAD_PAGE_SIZE;

  const handleLoadEarlier = useCallback(() => {
    const oldest = replies?.[0];
    if (!oldest || loadEarlier.isPending) return;
    const container = scrollContainerRef.current;
    const prevTop = container?.scrollTop ?? 0;
    void loadEarlier
      .mutateAsync(oldest["@id"])
      .then((earlier) => {
        if (earlier.length < THREAD_PAGE_SIZE) setNoEarlier(true);
        requestAnimationFrame(() => {
          // At the scroll extreme Chromium pins to the edge through prepends; restoring scrollTop restores the view.
          if (container) container.scrollTop = prevTop;
        });
      })
      .catch(() => {});
  }, [replies, loadEarlier]);

  const replyGroups = useMemo(() => groupMessages(replies ?? [], user), [replies, user]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const focusDoneRef = useRef<string | null>(null);
  const focusLoadAttemptsRef = useRef(0);
  useEffect(() => {
    if (!focusReplyId || focusDoneRef.current === focusReplyId) return;
    if (!replies || replies.length === 0) return;
    const present = replies.some((m) => m["@id"].endsWith(`/${focusReplyId}`));
    if (present || noEarlier || loadEarlier.isPending) return;
    if (replies.length < THREAD_PAGE_SIZE && focusLoadAttemptsRef.current === 0) return;
    if (focusLoadAttemptsRef.current >= 10) return;
    focusLoadAttemptsRef.current += 1;
    handleLoadEarlier();
  }, [focusReplyId, replies, noEarlier, loadEarlier.isPending, handleLoadEarlier]);
  useEffect(() => {
    if (!focusReplyId || focusDoneRef.current === focusReplyId) return;
    if (!replies || replies.length === 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(
      `[data-message-id$="/${CSS.escape(focusReplyId)}"]`,
    );
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "auto" });
    target.setAttribute("data-focus", "");
    focusDoneRef.current = focusReplyId;
    const timer = setTimeout(() => {
      target.removeAttribute("data-focus");
      onReplyFocusComplete?.();
    }, 1600);
    return () => clearTimeout(timer);
  }, [focusReplyId, replies, onReplyFocusComplete]);

  const rootGroupProps = {
    communityId,
    user,
    isChannelModerator: false,
    moderatorUserIds: EMPTY_MODS,
    groupsByUserId: EMPTY_GROUPS,
    timezone,
    onToggleReaction: noop,
    onDeleteMessage: noop,
    onEditMessage: noop,
    onViewHistory: noop,
    onUserClick: noop,
    onDeleteAttachment: noop,
    readOnly: true as const,
  };

  const replyGroupProps = {
    communityId,
    user,
    isChannelModerator: false,
    moderatorUserIds: EMPTY_MODS,
    groupsByUserId: EMPTY_GROUPS,
    timezone,
    onToggleReaction: handleToggleReplyReaction,
    onDeleteMessage: handleDeleteReply,
    onEditMessage: handleEditReply,
    onViewHistory: onViewReplyHistory ?? noop,
    onUserClick: noop,
    onDeleteAttachment: noop,
    frozen,
    canReact: canParticipate,
    canModerate,
    canEmbed,
    onEmbedMessage,
    compact: true as const,
  };

  return (
    <aside
      data-testid="thread-panel"
      className="relative z-10 flex w-96 shrink-0 flex-col border-l border-line bg-canvas max-md:fixed max-md:inset-0 max-md:z-40 max-md:w-full"
    >
      <header className="flex items-center gap-2 border-b border-line bg-canvas px-4 py-3">
        <ReplyIcon size={16} className="text-fg-muted" />
        <h2 className="cap-trim text-[0.9375rem] font-semibold">{t("thread_title")}</h2>
        <button
          onClick={onClose}
          aria-label={t("common:close")}
          title={t("common:close")}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-surface hover:text-fg max-md:h-11 max-md:w-11"
        >
          <XIcon size={18} />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollContainerRef}
          className="absolute inset-0 flex flex-col-reverse overflow-y-auto"
        >
          <div className="h-20 shrink-0" />
          <div className="flex-1" />
          {isLoading ? (
            <ThreadRepliesSkeleton />
          ) : (replies?.length ?? 0) === 0 ? (
            <p className="px-4 py-4 text-sm text-fg-muted">{t("thread_empty")}</p>
          ) : (
            <div className="px-2 pb-3">
              {maybeHasEarlier && (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    data-testid="thread-load-earlier"
                    onClick={handleLoadEarlier}
                    disabled={loadEarlier.isPending}
                    className="rounded-full bg-surface px-3 py-1 text-xs text-fg-muted ring-1 ring-inset ring-line transition-colors hover:bg-raised disabled:opacity-50"
                  >
                    {loadEarlier.isPending ? <Spinner size={12} /> : t("thread_load_earlier")}
                  </button>
                </div>
              )}
              {replyGroups.map((group, i) => (
                <MessageGroup
                  key={group.msgs[0]?.["@id"] ?? i}
                  group={group}
                  groupIndex={i}
                  showDivider={i > 0}
                  {...replyGroupProps}
                />
              ))}
            </div>
          )}
          <div className="px-4 pb-0.5 pt-3 text-[0.6875rem] font-bold uppercase tracking-wider text-fg-subtle">
            {t("thread_replies_count", { count: replies?.length ?? root?.replyCount ?? 0 })}
          </div>
          {root && (
            <div className="border-b border-l-2 border-line border-l-[var(--accent)] bg-surface px-4 py-3.5">
              <MessageGroup
                group={{ isOwn: root.createdBy?.id === user?.id, msgs: [root] }}
                groupIndex={0}
                {...rootGroupProps}
              />
            </div>
          )}
        </div>

        {!frozen && user && canParticipate && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-2 pt-1">
            <div className="pointer-events-auto">
              <MessageEditor
                onSend={(text, attachmentIris) => reply.mutate({ text, attachmentIris })}
                isPending={reply.isPending}
                placeholder={t("thread_reply_placeholder")}
                members={members}
                channels={channels}
                allowAttachments={allowAttachments}
                communityId={communityId}
                channelIdentifier={channelIdentifier}
                conversationIdentifier={conversationIdentifier}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
