import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useMessagePopover } from "@/context/MessagePopoverContext";
import { useViewportClamp } from "@/hooks/useViewportClamp";
import { QuickReactionPicker } from "@/components/chat/QuickReactionPicker";
import { IconButton } from "@/components/IconButton";
import {
  SmileIcon,
  EditIcon,
  HistoryIcon,
  TrashIcon,
  LinkIcon,
  PinIcon,
  ChatBubbleIcon,
  CodeIcon,
  FlagIcon,
} from "@/components/icons";

interface Props {
  show: boolean;
  ownerKey: string;
  canReact: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canViewHistory: boolean;
  communityIdentifier: string;
  onReaction: (emoji: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewHistory: () => void;
  onCopyLink?: () => void;
  canPin?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  canReply?: boolean;
  onReply?: () => void;
  canEmbed?: boolean;
  onEmbed?: () => void;
  canReport?: boolean;
  onReport?: () => void;
  onCloseTouch?: () => void;
}

export function MessageActions({
  show,
  canReact,
  canEdit,
  canDelete,
  canViewHistory,
  communityIdentifier,
  onReaction,
  onEdit,
  onDelete,
  onViewHistory,
  onCopyLink,
  canPin = false,
  isPinned = false,
  onPin,
  onUnpin,
  canReply = false,
  onReply,
  canEmbed = false,
  onEmbed,
  canReport = false,
  onReport,
  onCloseTouch,
  ownerKey,
}: Props) {
  const { t } = useTranslation(["channel", "common"]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { setOpenOwner, releaseOwner } = useMessagePopover();
  const pickerClampRef = useViewportClamp(pickerOpen);

  const holdsPopover = pickerOpen || confirmDelete;
  useEffect(() => {
    if (holdsPopover) setOpenOwner(ownerKey);
    else releaseOwner(ownerKey);
  }, [holdsPopover, ownerKey, setOpenOwner, releaseOwner]);
  useEffect(() => () => releaseOwner(ownerKey), [ownerKey, releaseOwner]);

  useClickOutside(
    wrapperRef,
    () => {
      setPickerOpen(false);
      setConfirmDelete(false);
      onCloseTouch?.();
    },
    !!(pickerOpen || confirmDelete || onCloseTouch),
  );

  const hasAnyAction =
    canReact ||
    canEdit ||
    canDelete ||
    canViewHistory ||
    !!onCopyLink ||
    canPin ||
    canReply ||
    (canEmbed && !!onEmbed) ||
    (canReport && !!onReport);
  const visible = show || pickerOpen || confirmDelete;

  if (!hasAnyAction) return null;

  return (
    <div
      ref={wrapperRef}
      className={`absolute bottom-full -right-1 z-10 translate-y-[3px] max-md:right-1 ${
        visible
          ? "block"
          : "hidden [@media(hover:hover)]:group-[:focus-visible,:focus-within:has(:focus-visible)]/msg:block"
      }`}
    >
      {confirmDelete ? (
        <div className="flex items-center gap-1.5 rounded-xl border border-danger bg-overlay px-2 py-1 shadow-soft-md">
          <span className="text-xs text-fg-muted">{t("delete_confirm")}</span>
          <button
            data-testid="msg-delete-confirm-btn"
            onClick={() => {
              onDelete();
              setConfirmDelete(false);
            }}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-danger transition-colors hover:bg-danger-subtle"
          >
            {t("common:yes")}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface"
          >
            {t("common:cancel")}
          </button>
        </div>
      ) : (
        <div className="relative">
          <div
            data-testid="msg-actions-row"
            className="flex items-center gap-0.5 rounded-xl border border-line bg-overlay px-0.5 py-0.5 shadow-soft-md max-md:max-w-[calc(100vw-2.75rem)] max-md:overflow-x-auto max-md:overscroll-x-contain max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden [&>*]:flex-none"
          >
            {canReact && (
              <IconButton
                title={t("add_reaction")}
                onClick={() => setPickerOpen((p) => !p)}
                testId="msg-action-react"
              >
                <SmileIcon />
              </IconButton>
            )}

            {canReply && (
              <IconButton title={t("reply_in_thread")} onClick={onReply} testId="msg-action-reply">
                <ChatBubbleIcon size={15} />
              </IconButton>
            )}

            {onCopyLink && (
              <IconButton title={t("copy_link")} onClick={onCopyLink} testId="msg-action-copy-link">
                <LinkIcon />
              </IconButton>
            )}

            {canEmbed && !!onEmbed && (
              <IconButton title={t("embed_message")} onClick={onEmbed} testId="msg-action-embed">
                <CodeIcon size={15} />
              </IconButton>
            )}

            {canReport && !!onReport && (
              <IconButton title={t("report_message")} onClick={onReport} testId="msg-action-report">
                <FlagIcon size={15} />
              </IconButton>
            )}

            {canPin && (
              <IconButton
                title={isPinned ? t("unpin_message") : t("pin_message")}
                onClick={isPinned ? onUnpin : onPin}
                testId="msg-action-pin"
              >
                <PinIcon size={15} className={isPinned ? "text-[var(--accent)]" : undefined} />
              </IconButton>
            )}

            {canViewHistory && (
              <IconButton
                title={t("edit_history_title")}
                onClick={onViewHistory}
                testId="msg-action-history"
              >
                <HistoryIcon />
              </IconButton>
            )}

            {canEdit && (
              <IconButton title={t("common:edit")} onClick={onEdit} testId="msg-action-edit">
                <EditIcon size={15} />
              </IconButton>
            )}

            {canDelete && (
              <IconButton
                title={t("common:delete")}
                onClick={() => setConfirmDelete(true)}
                testId="msg-action-delete"
              >
                <TrashIcon size={15} />
              </IconButton>
            )}
          </div>
          {canReact && pickerOpen && (
            <div ref={pickerClampRef} className="absolute bottom-full right-0 z-10 mb-1">
              <QuickReactionPicker
                communityIdentifier={communityIdentifier}
                onPick={(value) => {
                  onReaction(value);
                  setPickerOpen(false);
                }}
              />
            </div>
          )}
        </div>
      )}
      {/* Hover bridge: keeps hover alive while the pointer crosses the gap. Pointer
          devices only — on touch it has no purpose and covers the ⋯ trigger. */}
      <div className="h-2 [@media(hover:none)]:hidden" />
    </div>
  );
}
