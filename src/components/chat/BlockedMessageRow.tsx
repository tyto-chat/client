import { useTranslation } from "react-i18next";
import { ReplyIcon } from "@/components/icons";

export interface BlockedThreadLink {
  rootIri: string;
  replyCount: number;
}

interface Props {
  count: number;
  onShow: () => void;
  messageIri?: string;
  className?: string;
  threads?: readonly BlockedThreadLink[];
  onOpenThread?: (rootIri: string) => void;
}

export function BlockedMessageRow({
  count,
  onShow,
  messageIri,
  className = "",
  threads = [],
  onOpenThread,
}: Props) {
  const { t } = useTranslation("channel");
  const collapsedText = t("blocked_message_collapsed", { count });
  return (
    <div
      data-testid="blocked-message-row"
      data-message-id={messageIri}
      className={`flex flex-wrap items-center gap-2 py-2 pl-12 text-xs italic text-fg-subtle ${className}`}
    >
      <span>{collapsedText}</span>
      <span aria-hidden>·</span>
      <button
        type="button"
        data-testid="blocked-message-show"
        onClick={onShow}
        aria-label={`${t("blocked_message_show")}: ${collapsedText}`}
        className="not-italic font-semibold text-accent-text hover:underline"
      >
        {t("blocked_message_show")}
      </button>
      {onOpenThread &&
        threads.map((thread) => (
          <button
            key={thread.rootIri}
            type="button"
            data-testid="thread-replies-footer"
            onClick={() => onOpenThread(thread.rootIri)}
            className="flex items-center gap-1 not-italic font-semibold text-accent-text hover:underline"
          >
            <ReplyIcon size={13} />
            {t("thread_replies_count", { count: thread.replyCount })}
          </button>
        ))}
    </div>
  );
}
