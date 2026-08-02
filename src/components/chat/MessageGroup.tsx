import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/Avatar";
import { GroupIcon } from "@/components/GroupIcon";
import { MessageEditor } from "@/components/chat/MessageEditor";
import { MessageContent } from "@/components/chat/MessageContent";
import { MessageReactions } from "@/components/chat/MessageReactions";
import { MessageActions } from "@/components/chat/MessageActions";
import { RoleBadge } from "@/components/chat/RoleBadge";
import { TrashIcon, PinIcon, ReplyIcon, SmileIcon, MoreVerticalIcon } from "@/components/icons";
import { QuickReactionPicker } from "@/components/chat/QuickReactionPicker";
import { useNotification } from "@/context/NotificationContext";
import { useMessagePopover } from "@/context/MessagePopoverContext";
import { useViewportClamp } from "@/hooks/useViewportClamp";
import { copyMessageLinkToClipboard } from "@/utils/messageLink";
import { stableMessageKey } from "@/utils/messageKey";
import { getUserTextColor } from "@/utils/userColor";
import { isBirthdayToday } from "@/utils/birthday";
import { avatarUrl } from "@/api/client";
import { formatMessageTime, formatMessageTooltip, formatTimeOnly } from "@/utils/dateFormat";
import { useIsTouch } from "@/hooks/useIsTouch";
import { cn } from "@/utils/cn";
import type { Message, User, UserGroup } from "@/types/api";

import { MessageAttachments } from "@/components/chat/MessageAttachments";
import { PurgedAttachmentsNote } from "@/components/chat/PurgedAttachmentsNote";

export interface MessageGroupProps {
  group: { isOwn: boolean; msgs: Message[] };
  groupIndex: number;
  communityId?: string;
  user: User | null;
  isChannelModerator: boolean;
  moderatorUserIds: Set<number>;
  groupsByUserId: Map<number, UserGroup[]>;
  timezone: string;
  onToggleReaction: (messageIri: string, emoji: string, existingId?: number) => void;
  onDeleteMessage: (messageIri: string) => void;
  onEditMessage: (messageIri: string, text: string) => void;
  onViewHistory: (messageIri: string) => void;
  onUserClick?: (userId: number) => void;
  onDeleteAttachment: (attachmentIri: string) => void;
  readOnly?: boolean;
  frozen?: boolean;
  highlightTerms?: readonly string[];
  canPin?: boolean;
  onPinMessage?: (messageIri: string) => void;
  onUnpinMessage?: (messageIri: string) => void;
  canReply?: boolean;
  onOpenThread?: (rootIri: string) => void;
  canEmbed?: boolean;
  onEmbedMessage?: (messageIri: string) => void;
  canReport?: boolean;
  onReportMessage?: (messageIri: string) => void;
  canModerate?: boolean;
  canDeleteSystem?: boolean;
  compact?: boolean;
  showDivider?: boolean;
}

export function MessageGroup({
  group,
  groupIndex,
  communityId,
  user,
  isChannelModerator,
  moderatorUserIds,
  groupsByUserId,
  timezone,
  onToggleReaction,
  onDeleteMessage,
  onEditMessage,
  onViewHistory,
  onUserClick,
  onDeleteAttachment,
  readOnly = false,
  frozen = false,
  highlightTerms,
  canPin = false,
  onPinMessage,
  onUnpinMessage,
  canReply = false,
  onOpenThread,
  canEmbed = false,
  onEmbedMessage,
  canReport = false,
  onReportMessage,
  canModerate = false,
  canDeleteSystem = false,
  compact = false,
  showDivider = false,
}: MessageGroupProps) {
  const { t } = useTranslation(["community", "channel", "common"]);
  const { notify } = useNotification();
  const { openOwner, hoverOwner, setHoverOwner, releaseHover, touchOwner, setTouchOwner } =
    useMessagePopover();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sysPickerOpen, setSysPickerOpen] = useState(false);
  const sysClampRef = useViewportClamp(sysPickerOpen);
  const sysTouchClampRef = useViewportClamp(sysPickerOpen);
  const isTouch = useIsTouch();
  const first = group.msgs[0];

  const handleCopyLink = useCallback(
    async (messageIri: string) => {
      const ok = await copyMessageLinkToClipboard(messageIri);
      notify(
        ok ? t("channel:link_copied") : t("channel:link_copy_failed"),
        ok ? "success" : "error",
      );
    },
    [notify, t],
  );

  if (!first) return null;

  if (first.kind === "system") {
    const canReact = !!user && !readOnly && !frozen;
    const canDelete = canDeleteSystem && !readOnly && !frozen;
    const sysKey = stableMessageKey(first["@id"]);
    const sysTouchOpen = isTouch && touchOwner === sysKey;
    const pickReaction = (value: string) => {
      const myEntry = first.reactions?.[value]?.find((e) => e.userId === (user?.id ?? 0));
      onToggleReaction(first["@id"], value, myEntry?.id);
      setSysPickerOpen(false);
      setTouchOwner(null);
    };

    return (
      <div
        data-message-id={first["@id"]}
        className="group/sys animate-message-in relative flex flex-col items-center gap-1 px-4 py-1.5 text-xs text-fg-muted"
      >
        <div className="relative flex w-full items-center gap-3">
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span className="inline-flex max-w-[80%] items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-center max-md:max-w-[94%]">
            <span className="min-w-0 break-words">
              <MessageContent
                text={first.text}
                communityId={communityId}
                onUserClick={onUserClick}
                messageIri={first["@id"]}
              />
            </span>
            {!isTouch && canReact && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSysPickerOpen((o) => !o)}
                  title={t("channel:add_reaction")}
                  className="-mr-1 rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-canvas hover:text-fg-muted group-hover/sys:opacity-100 group-focus-within/sys:opacity-100"
                >
                  <SmileIcon size={13} />
                </button>
                {sysPickerOpen && (
                  <div
                    ref={sysClampRef}
                    className="absolute bottom-full right-0 z-20 mb-1 text-sm text-fg"
                  >
                    <QuickReactionPicker
                      communityIdentifier={communityId ?? ""}
                      onPick={pickReaction}
                    />
                  </div>
                )}
              </div>
            )}
            {!isTouch && canDelete && (
              <button
                type="button"
                onClick={() => onDeleteMessage(first["@id"])}
                title={t("channel:delete_system_message")}
                className="-mr-1 rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-canvas hover:text-danger group-hover/sys:opacity-100 group-focus-within/sys:opacity-100"
              >
                <TrashIcon size={12} />
              </button>
            )}
          </span>
          <span aria-hidden className="h-px flex-1 bg-line" />
          {isTouch && (canReact || canDelete) && (
            <>
              {sysTouchOpen && (
                <div
                  className="fixed inset-0 z-[9]"
                  onClick={() => {
                    setTouchOwner(null);
                    setSysPickerOpen(false);
                  }}
                />
              )}
              {sysTouchOpen ? (
                <div className="absolute right-0 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 rounded-xl border border-line bg-overlay px-1.5 py-1 text-fg shadow-soft-md">
                  {canReact && (
                    <button
                      type="button"
                      aria-label={t("channel:add_reaction")}
                      onClick={() => setSysPickerOpen((o) => !o)}
                      className="rounded p-1.5 text-fg-subtle active:bg-surface"
                    >
                      <SmileIcon size={16} />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      aria-label={t("channel:delete_system_message")}
                      onClick={() => {
                        onDeleteMessage(first["@id"]);
                        setTouchOwner(null);
                      }}
                      className="rounded p-1.5 text-fg-subtle active:bg-surface"
                    >
                      <TrashIcon size={15} />
                    </button>
                  )}
                  {sysPickerOpen && (
                    <div
                      ref={sysTouchClampRef}
                      className="absolute bottom-full right-0 z-20 mb-1 text-sm text-fg"
                    >
                      <QuickReactionPicker
                        communityIdentifier={communityId ?? ""}
                        onPick={pickReaction}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="sys-touch-actions-btn"
                  aria-label={t("channel:message_actions")}
                  onClick={() => setTouchOwner(sysKey)}
                  className="absolute right-0 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-fg-subtle active:bg-surface"
                >
                  <MoreVerticalIcon size={18} />
                </button>
              )}
            </>
          )}
        </div>
        <MessageReactions
          show
          message={first}
          currentUserId={user?.id ?? 0}
          communityIdentifier={communityId ?? ""}
          disabled={!user || readOnly || frozen}
          onToggle={(emoji, existingId) => onToggleReaction(first["@id"], emoji, existingId)}
        />
      </div>
    );
  }

  if (!first.createdBy) return null;
  const author = first.createdBy;
  const authorGroups = groupsByUserId.get(author.id) ?? [];

  return (
    <div
      data-message-id={first["@id"]}
      className={`animate-message-in flex gap-3 ${
        showDivider
          ? "border-t border-msg-divider"
          : groupIndex > 0
            ? readOnly
              ? "mt-[18px]"
              : "mt-1.5"
            : ""
      }`}
    >
      <div className={`${showDivider ? "mt-3.5" : "mt-0.5"} w-9 shrink-0`}>
        <Avatar
          name={first.createdBy.profile.name}
          colorKey={first.createdBy.profile["@id"]}
          imageUrl={avatarUrl(first.createdBy.profile.avatar?.contentUrl ?? null, "md")}
          size="sm"
          onClick={onUserClick && (() => onUserClick(author.id))}
          userId={first.createdBy.id}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`flex flex-wrap items-center gap-2 mb-0.5 ${showDivider ? "pt-3" : ""} ${isTouch ? "pr-9" : ""}`}
          onMouseEnter={readOnly ? undefined : () => setHoverOwner(stableMessageKey(first["@id"]))}
          onMouseLeave={readOnly ? undefined : () => releaseHover(stableMessageKey(first["@id"]))}
        >
          <button
            type="button"
            className={`text-sm font-semibold ${onUserClick ? "cursor-pointer hover:underline" : "cursor-default"}`}
            style={{ color: getUserTextColor(first.createdBy.profile["@id"]) }}
            onClick={onUserClick && (() => onUserClick(author.id))}
            data-testid="msg-author-name"
          >
            {first.createdBy.profile.name}
            {isBirthdayToday(first.createdBy.profile) && (
              <span
                className="ml-1 not-italic"
                title={t("common:birthday_today")}
                aria-label={t("common:birthday_today")}
              >
                🎂
              </span>
            )}
          </button>
          {first.createdBy.isAdmin ? (
            <RoleBadge kind="admin" />
          ) : (
            moderatorUserIds.has(first.createdBy.id) && <RoleBadge kind="mod" />
          )}
          {authorGroups.map((g) => (
            <span
              key={g.identifier}
              className="inline-flex h-[18px] items-center gap-0.5 rounded-full px-1.5 text-[0.625rem] font-semibold leading-none text-white"
              style={{ backgroundColor: g.color ?? "#6b7280" }}
              title={g.name}
            >
              {g.icon && (
                <GroupIcon
                  icon={g.icon}
                  name=""
                  communityIdentifier={communityId}
                  className="text-[0.625rem] leading-none"
                />
              )}
              {g.name}
            </span>
          ))}
          <span
            className="text-xs text-fg-subtle max-md:order-last max-md:-mt-1 max-md:w-full"
            title={formatMessageTooltip(first.createdAt, timezone)}
          >
            {formatMessageTime(first.createdAt, timezone)}
          </span>
        </div>
        {group.msgs.map((msg, i) => {
          const isAuthor = !!user && msg.createdBy?.id === user.id;
          const isAdmin = user?.roles?.includes("ROLE_ADMIN") ?? false;
          const canDelete = isAuthor || isAdmin || isChannelModerator;
          const canEdit = isAuthor || isAdmin;
          const ownerKey = stableMessageKey(msg["@id"]);
          // An open popover pins the hover bar to its own row: sweeping the
          // pointer to reach it would otherwise reveal every row it crosses.
          const showActions =
            !isTouch && hoverOwner === ownerKey && (openOwner === null || openOwner === ownerKey);
          // Keyed on the stable key, not the raw IRI: the optimistic→server swap
          // changes @id, which would silently drop the open state mid-interaction.
          const isTouchActive = isTouch && touchOwner === stableMessageKey(msg["@id"]);
          const hasTouchActions = !!user || !msg.isDeleted;

          return (
            <div
              key={stableMessageKey(msg["@id"])}
              data-message-id={msg["@id"]}
              tabIndex={readOnly ? undefined : 0}
              className={`group/msg relative focus:outline-none ${i > 0 ? "animate-message-in pt-2" : ""} ${i === group.msgs.length - 1 ? (compact ? "pb-0.5" : "pb-3") : ""}`}
              onMouseEnter={() => setHoverOwner(ownerKey)}
              onMouseLeave={() => releaseHover(ownerKey)}
            >
              {i > 0 && (
                <span
                  className="absolute -left-12 top-2 flex h-[1.42rem] w-12 select-none items-center justify-end pr-2 text-[0.625rem] leading-none text-fg-subtle"
                  title={formatMessageTooltip(msg.createdAt, timezone)}
                >
                  {formatTimeOnly(msg.createdAt, timezone)}
                </span>
              )}
              {isTouch && !readOnly && hasTouchActions && (
                <>
                  {/* z-9: must stay below the z-10 action bar it dismisses. */}
                  {isTouchActive && (
                    <div className="fixed inset-0 z-[9]" onClick={() => setTouchOwner(null)} />
                  )}
                  {/* The bar opens into this slot, so the trigger steps aside while
                      it is up. Closing is the overlay above or any action button. */}
                  {!isTouchActive && (
                    <button
                      type="button"
                      data-testid="msg-touch-actions-btn"
                      aria-label={t("channel:message_actions")}
                      onClick={() => setTouchOwner(stableMessageKey(msg["@id"]))}
                      className={cn(
                        "absolute right-0 z-10 flex h-11 w-11 items-center justify-center rounded-full text-fg-subtle transition-colors",
                        i === 0 ? "-top-[2.1rem]" : "top-0",
                        "active:bg-surface",
                      )}
                    >
                      <MoreVerticalIcon size={18} />
                    </button>
                  )}
                </>
              )}
              {!readOnly && (
                <MessageActions
                  ownerKey={ownerKey}
                  show={showActions || isTouchActive}
                  canReact={!!user && !frozen}
                  canEdit={canEdit && !msg.isDeleted && !frozen}
                  canDelete={canDelete && !msg.isDeleted && !frozen}
                  canViewHistory={(isAdmin || canModerate) && (msg.edited || msg.isDeleted)}
                  communityIdentifier={communityId ?? ""}
                  onReaction={(emoji) => {
                    const myEntry = msg.reactions?.[emoji]?.find(
                      (e) => e.userId === (user?.id ?? 0),
                    );
                    onToggleReaction(msg["@id"], emoji, myEntry?.id);
                    setTouchOwner(null);
                  }}
                  onEdit={() => {
                    setEditingId(msg["@id"]);
                    setTouchOwner(null);
                  }}
                  onDelete={() => {
                    onDeleteMessage(msg["@id"]);
                    setTouchOwner(null);
                  }}
                  onViewHistory={() => {
                    onViewHistory(msg["@id"]);
                    setTouchOwner(null);
                  }}
                  onCopyLink={() => {
                    void handleCopyLink(msg["@id"]);
                    setTouchOwner(null);
                  }}
                  canPin={canPin && !msg.isDeleted && !frozen}
                  isPinned={!!msg.pinned}
                  onPin={() => {
                    onPinMessage?.(msg["@id"]);
                    setTouchOwner(null);
                  }}
                  onUnpin={() => {
                    onUnpinMessage?.(msg["@id"]);
                    setTouchOwner(null);
                  }}
                  canReply={canReply && !frozen}
                  onReply={() => {
                    onOpenThread?.(msg["@id"]);
                    setTouchOwner(null);
                  }}
                  canEmbed={canEmbed && !msg.isDeleted}
                  onEmbed={() => {
                    onEmbedMessage?.(msg["@id"]);
                    setTouchOwner(null);
                  }}
                  canReport={
                    canReport && !!user && !msg.isDeleted && msg.createdBy?.id !== user?.id
                  }
                  onReport={() => {
                    onReportMessage?.(msg["@id"]);
                    setTouchOwner(null);
                  }}
                />
              )}
              {editingId === msg["@id"] ? (
                <MessageEditor
                  initialContent={msg.text ?? ""}
                  communityId={communityId}
                  onSend={(html) => {
                    onEditMessage(msg["@id"], html);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  {msg.pinned && !readOnly && (
                    <span className="mb-0.5 flex items-center gap-1 text-[0.625rem] font-semibold uppercase tracking-wide text-accent-text">
                      <PinIcon size={11} />
                      {t("channel:pinned_badge")}
                    </span>
                  )}
                  <MessageContent
                    text={msg.text}
                    communityId={communityId}
                    onUserClick={onUserClick}
                    messageIri={msg["@id"]}
                    highlightTerms={highlightTerms}
                  />
                  {msg.edited && !msg.isDeleted && (
                    <span className="text-xs italic text-fg-subtle">{t("channel:edited")}</span>
                  )}
                  {(msg.attachments?.length ?? 0) > 0 && !msg.isDeleted && (
                    <MessageAttachments
                      attachments={msg.attachments!}
                      canDelete={canDelete}
                      onDeleteAttachment={onDeleteAttachment}
                    />
                  )}
                  {!msg.isDeleted && (
                    <PurgedAttachmentsNote count={msg.purgedAttachmentCount ?? 0} />
                  )}
                  {!readOnly && (msg.replyCount ?? 0) > 0 && (
                    <button
                      data-testid="thread-replies-footer"
                      onClick={() => onOpenThread?.(msg["@id"])}
                      className="mt-2 flex items-center gap-1.5 text-[0.78125rem] font-semibold text-accent-text hover:underline"
                    >
                      <ReplyIcon size={15} />
                      <span className="block cap-trim">
                        {t("channel:thread_replies_count", { count: msg.replyCount ?? 0 })}
                      </span>
                      {msg.lastReplyAt && (
                        <span className="font-normal text-fg-subtle">
                          · {formatMessageTime(msg.lastReplyAt, timezone)}
                        </span>
                      )}
                    </button>
                  )}
                </>
              )}
              <MessageReactions
                show={showActions && !readOnly}
                message={msg}
                currentUserId={user?.id ?? 0}
                communityIdentifier={communityId ?? ""}
                disabled={!user || readOnly || frozen}
                reserveSpace={!readOnly && !compact && i === group.msgs.length - 1}
                onToggle={(emoji, existingId) => onToggleReaction(msg["@id"], emoji, existingId)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
