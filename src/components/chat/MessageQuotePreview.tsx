import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMessage } from "@/queries/messageQueries";
import { Avatar } from "@/components/Avatar";
import { avatarUrl } from "@/api/client";
import { getUserTextColor } from "@/utils/userColor";
import { formatMessageTime, formatMessageTooltip } from "@/utils/dateFormat";
import { useTimezone } from "@/context/TimezoneContext";
import { MessageContent } from "./MessageContent";

interface Props {
  messageId: string;
  selfMessageIri?: string;
}

export function MessageQuotePreview({ messageId, selfMessageIri }: Props) {
  const { t } = useTranslation("channel");
  const navigate = useNavigate();
  const { timezone } = useTimezone();
  const { data, isLoading, isError } = useMessage(messageId);

  const goToMessage = () => {
    void navigate({ to: "/m/$messageId", params: { messageId } });
  };

  if (data && selfMessageIri && data["@id"] === selfMessageIri) return null;

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label={t("loading_linked_message")}
        className="mb-1.5 flex items-center gap-2 rounded border-l-2 border-[var(--accent)] bg-surface px-2 py-1.5"
      >
        <span className="flex gap-1">
          <span
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-fg-subtle"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-fg-subtle"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-fg-subtle"
            style={{ animationDelay: "300ms" }}
          />
        </span>
        <span className="text-xs italic text-fg-muted">{t("loading_linked_message")}</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mb-1.5 rounded border-l-2 border-line bg-surface px-2 py-1.5 text-xs italic text-fg-muted">
        {t("linked_message_unavailable")}
      </div>
    );
  }

  const author = data.createdBy;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goToMessage}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToMessage();
        }
      }}
      className="mb-1.5 cursor-pointer rounded border-l-2 border-[var(--accent)] bg-surface px-2 py-1.5 transition-colors hover:bg-raised"
    >
      <div className="mb-0.5 flex items-baseline gap-2">
        <Avatar
          name={author?.profile.name ?? ""}
          colorKey={author?.profile["@id"] ?? ""}
          imageUrl={avatarUrl(author?.profile.avatar?.contentUrl ?? null)}
          size="xs"
        />
        <span
          className="text-xs font-semibold"
          style={{ color: getUserTextColor(author?.profile["@id"] ?? "") }}
        >
          {author?.profile.name}
        </span>
        <span
          className="text-[0.625rem] text-fg-subtle"
          title={formatMessageTooltip(data.createdAt, timezone)}
        >
          {formatMessageTime(data.createdAt, timezone)}
        </span>
      </div>
      <div className="line-clamp-3 text-xs text-fg-muted">
        <MessageContent
          text={data.text}
          communityId={data.communityIdentifier ?? undefined}
          renderPermalinkPreview={false}
        />
      </div>
    </div>
  );
}
