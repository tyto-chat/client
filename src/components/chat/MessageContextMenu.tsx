import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useClickOutside } from "@/hooks/useClickOutside";
import { QuickReactionPicker } from "@/components/chat/QuickReactionPicker";
import {
  ChatBubbleIcon,
  CodeIcon,
  CopyIcon,
  EditIcon,
  FlagIcon,
  HistoryIcon,
  LinkIcon,
  PinIcon,
  SmileIcon,
  TrashIcon,
} from "@/components/icons";

export interface MessageContextMenuProps {
  x: number;
  y: number;
  communityIdentifier: string;
  canCopyText: boolean;
  canReact: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canViewHistory: boolean;
  canPin: boolean;
  isPinned: boolean;
  canReply: boolean;
  canEmbed: boolean;
  canReport: boolean;
  onCopyMessage: () => void;
  onCopyLink: () => void;
  onReaction: (emoji: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewHistory: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onReply: () => void;
  onEmbed: () => void;
  onReport: () => void;
  onClose: () => void;
}

interface Item {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

const EDGE = 8;

export function MessageContextMenu(props: MessageContextMenuProps) {
  const { t } = useTranslation(["channel", "common"]);
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"items" | "picker" | "confirm-delete">("items");
  const [pos, setPos] = useState({ left: props.x, top: props.y });
  const { onClose } = props;

  useClickOutside(ref, onClose);

  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      left: Math.max(EDGE, Math.min(props.x, window.innerWidth - rect.width - EDGE)),
      top: Math.max(EDGE, Math.min(props.y, window.innerHeight - rect.height - EDGE)),
    });
  }, [props.x, props.y, view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  const items: Item[] = [];
  if (props.canCopyText) {
    items.push({
      key: "copy-message",
      label: t("copy_message"),
      icon: <CopyIcon size={15} />,
      onSelect: run(props.onCopyMessage),
    });
  }
  items.push({
    key: "copy-link",
    label: t("copy_link"),
    icon: <LinkIcon size={15} />,
    onSelect: run(props.onCopyLink),
  });
  if (props.canReply) {
    items.push({
      key: "reply",
      label: t("reply_in_thread"),
      icon: <ChatBubbleIcon size={15} />,
      onSelect: run(props.onReply),
    });
  }
  if (props.canReact) {
    items.push({
      key: "react",
      label: t("add_reaction"),
      icon: <SmileIcon size={15} />,
      onSelect: () => setView("picker"),
    });
  }
  if (props.canEdit) {
    items.push({
      key: "edit",
      label: t("common:edit"),
      icon: <EditIcon size={15} />,
      onSelect: run(props.onEdit),
    });
  }
  if (props.canPin) {
    items.push({
      key: "pin",
      label: props.isPinned ? t("unpin_message") : t("pin_message"),
      icon: <PinIcon size={15} />,
      onSelect: run(props.isPinned ? props.onUnpin : props.onPin),
    });
  }
  if (props.canEmbed) {
    items.push({
      key: "embed",
      label: t("embed_message"),
      icon: <CodeIcon size={15} />,
      onSelect: run(props.onEmbed),
    });
  }
  if (props.canViewHistory) {
    items.push({
      key: "history",
      label: t("edit_history_title"),
      icon: <HistoryIcon size={15} />,
      onSelect: run(props.onViewHistory),
    });
  }
  if (props.canReport) {
    items.push({
      key: "report",
      label: t("report_message"),
      icon: <FlagIcon size={15} />,
      onSelect: run(props.onReport),
    });
  }
  if (props.canDelete) {
    items.push({
      key: "delete",
      label: t("common:delete"),
      icon: <TrashIcon size={15} />,
      onSelect: () => setView("confirm-delete"),
      danger: true,
    });
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-testid="message-context-menu"
      className="fixed z-50 min-w-48 rounded-xl border border-line bg-overlay p-1 text-sm text-fg shadow-soft-md"
      style={pos}
    >
      {view === "picker" && (
        <QuickReactionPicker
          communityIdentifier={props.communityIdentifier}
          onPick={(value) => {
            props.onReaction(value);
            onClose();
          }}
        />
      )}
      {view === "confirm-delete" && (
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="text-xs text-fg-muted">{t("delete_confirm")}</span>
          <button
            type="button"
            onClick={run(props.onDelete)}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-danger hover:bg-danger-subtle"
          >
            {t("common:yes")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-fg-muted hover:bg-surface"
          >
            {t("common:cancel")}
          </button>
        </div>
      )}
      {view === "items" &&
        items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            data-testid={`msg-context-${item.key}`}
            onClick={item.onSelect}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-surface ${
              item.danger ? "text-danger" : "text-fg"
            }`}
          >
            <span className="flex w-4 shrink-0 justify-center text-fg-subtle">{item.icon}</span>
            <span className="cap-trim">{item.label}</span>
          </button>
        ))}
    </div>,
    document.body,
  );
}
