import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { groupMessages } from "@/utils/messageGroups";
import { useMessagePaneScroll } from "@/hooks/useMessagePaneScroll";
import { MessageGroup } from "@/components/chat/MessageGroup";
import { MessageEditor } from "@/components/chat/MessageEditor";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { ArrowDownIcon, ChatBubbleIcon, Spinner } from "@/components/icons";
import { stableMessageKey } from "@/utils/messageKey";
import { usePresenceSubscription } from "@/queries/presenceQueries";
import { channelTypingScope, conversationTypingScope } from "@/queries/typingQueries";
import type { MemberItem } from "@/utils/userMentionExtension";
import type { Message, User, UserGroup } from "@/types/api";

const EMPTY_MODS: Set<number> = new Set();
const EMPTY_GROUPS: Map<number, UserGroup[]> = new Map();

interface MentionableChannel {
  name: string;
  identifier: string;
}

interface MessagePaneProps {
  messages: Message[];
  hasPreviousPage: boolean;
  isFetchingPreviousPage: boolean;
  fetchPreviousPage: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  newMessagesCount?: number;
  focusMessageId?: string | null;
  onFocusComplete?: () => void;
  onJumpToLatest?: () => void | Promise<void>;
  scrollToBottomTrigger?: number;
  onSend: (text: string, attachmentIris?: string[]) => void | Promise<unknown>;
  isSending: boolean;
  onEditMessage: (iri: string, text: string) => void;
  onDeleteMessage: (iri: string) => void;
  onToggleReaction: (iri: string, emoji: string, existingId?: number) => void;
  onViewHistory: (iri: string) => void;
  onUserClick?: (userId: number) => void;
  onDeleteAttachment: (iri: string) => void;
  user: User | null;
  members: MemberItem[];
  channels?: MentionableChannel[];
  groupsByUserId?: Map<number, UserGroup[]>;
  moderatorUserIds?: Set<number>;
  isChannelModerator?: boolean;
  canPin?: boolean;
  canBroadcast?: boolean;
  onPinMessage?: (iri: string) => void;
  canModerate?: boolean;
  canDeleteSystem?: boolean;
  onUnpinMessage?: (iri: string) => void;
  canReply?: boolean;
  onOpenThread?: (rootIri: string) => void;
  canEmbed?: boolean;
  onEmbedMessage?: (messageIri: string) => void;
  canReport?: boolean;
  onReportMessage?: (messageIri: string) => void;
  timezone: string;
  communityId?: string;
  channelIdentifier?: string;
  conversationIdentifier?: string;
  allowAttachments?: boolean;
  placeholder: string;
  emptyTitle: string;
  emptySubtitle?: string;
  beginningLabel: string;
  onAtBottom?: () => void;
  footer?: React.ReactNode;
  footerHidesWhenScrolled?: boolean;
  readOnly?: boolean;
  frozen?: boolean;
}

export function MessagePane({
  messages,
  hasPreviousPage,
  isFetchingPreviousPage,
  fetchPreviousPage,
  hasNextPage = false,
  isFetchingNextPage = false,
  fetchNextPage,
  newMessagesCount = 0,
  focusMessageId,
  onFocusComplete,
  onJumpToLatest,
  scrollToBottomTrigger = 0,
  onSend,
  isSending,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onViewHistory,
  onUserClick,
  onDeleteAttachment,
  user,
  members,
  channels,
  groupsByUserId,
  moderatorUserIds,
  isChannelModerator = false,
  canPin = false,
  canBroadcast = false,
  onPinMessage,
  canModerate = false,
  canDeleteSystem = false,
  onUnpinMessage,
  canReply = false,
  onOpenThread,
  canEmbed = false,
  onEmbedMessage,
  canReport = false,
  onReportMessage,
  timezone,
  communityId,
  channelIdentifier,
  conversationIdentifier,
  allowAttachments = false,
  placeholder,
  emptyTitle,
  emptySubtitle,
  beginningLabel,
  onAtBottom,
  footer,
  footerHidesWhenScrolled = false,
  readOnly = false,
  frozen = false,
}: MessagePaneProps) {
  const { t } = useTranslation("channel");

  const lastMessage = messages[messages.length - 1];
  const lastHasReactions =
    !!lastMessage?.reactions && Object.keys(lastMessage.reactions).length > 0;
  const lastIsSystem = lastMessage?.kind === "system";
  const reclaim = footer || lastHasReactions || lastIsSystem ? 0 : 52;

  const {
    scrollContainerRef,
    topSentinelRef,
    bottomSentinelRef,
    composerRef,
    hasNewMessages,
    isAtBottom,
    scrollToBottom,
    bottomReserve,
    composerHeight,
  } = useMessagePaneScroll({
    messages,
    hasPreviousPage,
    isFetchingPreviousPage,
    fetchPreviousPage,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    focusMessageId,
    onFocusComplete,
    scrollToBottomTrigger,
    onAtBottom,
    reclaim,
  });

  const messageGroups = useMemo(() => groupMessages(messages, user), [messages, user]);

  const presenceUserIds = useMemo(() => {
    const ids = new Set<number>();
    for (const m of messages) {
      const id = m.createdBy?.id;
      if (typeof id === "number" && id > 0) ids.add(id);
    }
    return Array.from(ids);
  }, [messages]);
  usePresenceSubscription(presenceUserIds);

  return (
    <>
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollContainerRef}
          data-testid="message-scroll"
          className="scrollbar-autohide absolute inset-0 flex flex-col overflow-y-auto px-[18px] pt-3.5 [scrollbar-color:color-mix(in_srgb,var(--accent)_35%,transparent)_transparent]"
          style={{ paddingBottom: bottomReserve }}
        >
          <div ref={topSentinelRef} className="shrink-0" />
          {isFetchingPreviousPage && (
            <div className="flex justify-center py-3">
              <Spinner size={20} className="text-[var(--accent-muted)]" />
            </div>
          )}
          {!hasPreviousPage && messages.length > 0 && (
            <p className="py-3 text-center text-xs text-fg-subtle">{beginningLabel}</p>
          )}
          <div className="flex-1" />
          {messages.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-fg-subtle">
              <ChatBubbleIcon size={40} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">{emptyTitle}</p>
              {emptySubtitle && <p className="mt-1 text-xs">{emptySubtitle}</p>}
            </div>
          )}
          <div role="log" aria-live="polite" aria-relevant="additions" aria-label={t("messages")}>
            {messageGroups.map((group, groupIndex) => (
              <MessageGroup
                key={group.msgs[0] ? stableMessageKey(group.msgs[0]["@id"]) : groupIndex}
                group={group}
                groupIndex={groupIndex}
                showDivider={
                  groupIndex > 0 &&
                  group.msgs[0]?.kind !== "system" &&
                  messageGroups[groupIndex - 1]?.msgs[0]?.kind !== "system"
                }
                communityId={communityId}
                user={user}
                isChannelModerator={isChannelModerator}
                moderatorUserIds={moderatorUserIds ?? EMPTY_MODS}
                groupsByUserId={groupsByUserId ?? EMPTY_GROUPS}
                timezone={timezone}
                onToggleReaction={onToggleReaction}
                onDeleteMessage={onDeleteMessage}
                onEditMessage={onEditMessage}
                onViewHistory={onViewHistory}
                onUserClick={onUserClick}
                onDeleteAttachment={onDeleteAttachment}
                readOnly={readOnly}
                frozen={frozen}
                canPin={!readOnly && canPin}
                onPinMessage={onPinMessage}
                canModerate={canModerate}
                canDeleteSystem={canDeleteSystem}
                onUnpinMessage={onUnpinMessage}
                canReply={!readOnly && canReply}
                onOpenThread={onOpenThread}
                canEmbed={!readOnly && canEmbed}
                onEmbedMessage={onEmbedMessage}
                canReport={!readOnly && canReport}
                onReportMessage={onReportMessage}
              />
            ))}
          </div>
          {hasNextPage && (
            <div className="flex justify-center py-3">
              {isFetchingNextPage && <Spinner size={20} className="text-[var(--accent-muted)]" />}
            </div>
          )}
          <div ref={bottomSentinelRef} className="shrink-0" />
        </div>
        {hasNewMessages && (
          <div
            className="absolute left-0 right-0 flex justify-center pointer-events-none z-10"
            style={{ bottom: composerHeight + 8 }}
          >
            <button
              onClick={scrollToBottom}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-accent-gradient px-3 py-1.5 text-xs font-semibold text-[var(--accent-on)] shadow-soft-md hover:bg-[var(--accent-hover)] transition-colors"
            >
              <ArrowDownIcon size={12} />
              {t("new_messages")}
            </button>
          </div>
        )}
        {hasNextPage && !hasNewMessages && onJumpToLatest && (
          <div
            className="absolute left-0 right-0 flex justify-center pointer-events-none z-10"
            style={{ bottom: composerHeight + 8 }}
          >
            <button
              onClick={() => void onJumpToLatest()}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-accent-gradient px-3 py-1.5 text-xs font-semibold text-[var(--accent-on)] shadow-soft-md hover:bg-[var(--accent-hover)] transition-colors"
            >
              <ArrowDownIcon size={12} />
              {newMessagesCount > 0
                ? t("new_messages_pill", { count: newMessagesCount })
                : t("jump_to_latest")}
            </button>
          </div>
        )}
        {/* Overlays the scroll area, which reserves this element's measured height. */}
        <div
          ref={composerRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-b from-transparent to-canvas px-[18px] pb-2 pt-1"
        >
          <div
            className={
              footerHidesWhenScrolled && !isAtBottom
                ? "pointer-events-none translate-y-2 opacity-0 transition-all duration-200"
                : "pointer-events-auto transition-all duration-200"
            }
          >
            {footer ?? (
              <>
                <TypingIndicator
                  scope={
                    conversationIdentifier
                      ? conversationTypingScope(conversationIdentifier)
                      : communityId && channelIdentifier
                        ? channelTypingScope(communityId, channelIdentifier)
                        : null
                  }
                />
                <MessageEditor
                  onSend={onSend}
                  isPending={isSending}
                  placeholder={placeholder}
                  channels={channels ?? []}
                  members={members}
                  canBroadcast={canBroadcast}
                  allowAttachments={allowAttachments}
                  communityId={communityId}
                  channelIdentifier={channelIdentifier}
                  conversationIdentifier={conversationIdentifier}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
