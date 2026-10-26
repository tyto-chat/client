import { useTranslation } from "react-i18next";

interface Props {
  count: number;
  onShow: () => void;
  messageIri?: string;
  className?: string;
}

export function BlockedMessageRow({ count, onShow, messageIri, className = "" }: Props) {
  const { t } = useTranslation("channel");
  return (
    <div
      data-testid="blocked-message-row"
      data-message-id={messageIri}
      className={`flex items-center gap-2 py-2 pl-12 text-xs italic text-fg-subtle ${className}`}
    >
      <span>{t("blocked_message_collapsed", { count })}</span>
      <span aria-hidden>·</span>
      <button
        type="button"
        data-testid="blocked-message-show"
        onClick={onShow}
        className="not-italic font-semibold text-accent-text hover:underline"
      >
        {t("blocked_message_show")}
      </button>
    </div>
  );
}
