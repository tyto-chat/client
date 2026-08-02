import { useMemo } from "react";
import { uuidFromIri } from "@/api/hydra";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { MessageContent } from "@/components/chat/MessageContent";
import { useMessage, useMessageHistory } from "@/queries/messageQueries";
import { useTimezone } from "@/context/TimezoneContext";
import { formatMessageTime, formatMessageTooltip } from "@/utils/dateFormat";
import { avatarUrl } from "@/api/client";
import { getUserTextColor } from "@/utils/userColor";
import type { MessageBodyRevision } from "@/types/api";

interface Props {
  messageIri: string;
  onClose: () => void;
}

type HistoryEntry = MessageBodyRevision & { isDeleteMarker?: boolean };

export function MessageHistoryModal({ messageIri, onClose }: Props) {
  const { t } = useTranslation(["channel", "common"]);
  const { data: history, isLoading } = useMessageHistory(messageIri);
  const uuid = uuidFromIri(messageIri);
  const { data: message } = useMessage(uuid);
  const { timezone } = useTimezone();

  const entries: HistoryEntry[] = useMemo(() => {
    const list: HistoryEntry[] = history ? [...history] : [];
    if (message?.isDeleted && message.deletedAt) {
      list.push({
        "@id": `${messageIri}#deleted`,
        "@type": "DeletionMarker",
        body: "",
        createdAt: message.deletedAt,
        createdBy: message.deletedBy ?? undefined,
        isDeleteMarker: true,
      });
    }
    return list;
  }, [history, message, messageIri]);

  return (
    <Modal title={t("edit_history_title")} onClose={onClose} size="md">
      {() => (
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {isLoading && <p className="text-sm text-fg-muted">{t("common:loading")}</p>}
          {!isLoading && entries.length === 0 && (
            <p className="text-sm text-fg-muted">{t("no_edits")}</p>
          )}
          {entries.length > 0 && (
            <ol className="relative ml-3">
              {entries.map((revision, i) => {
                const isDeleteMarker = !!revision.isDeleteMarker;
                const isLast = i === entries.length - 1;
                return (
                  <li key={revision["@id"]} className="relative mb-6 pl-6">
                    {/* Per-row, not a border on the <ol>, so the line stops at the last bullet. */}
                    {!isLast && (
                      <span
                        aria-hidden
                        className="absolute -bottom-9 left-0 top-[30px] w-px -translate-x-1/2 bg-fg-subtle/50"
                      />
                    )}
                    {/* Offset down so the dot aligns with the body card, not the name. */}
                    <span className="absolute -left-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-canvas ring-2 ring-line">
                      <span
                        className={`h-2 w-2 rounded-full ${isDeleteMarker ? "bg-danger" : isLast ? "bg-[var(--accent)]" : "bg-fg-subtle"}`}
                      />
                    </span>

                    <div className="mb-2 flex items-center gap-2">
                      {revision.createdBy ? (
                        <>
                          <Avatar
                            name={revision.createdBy.profile.name}
                            colorKey={revision.createdBy.profile["@id"]}
                            imageUrl={avatarUrl(
                              revision.createdBy.profile.avatar?.contentUrl ?? null,
                            )}
                            size="sm"
                          />
                          <span
                            className="text-sm font-medium"
                            style={{ color: getUserTextColor(revision.createdBy.profile["@id"]) }}
                          >
                            {revision.createdBy.profile.name}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-medium text-fg-subtle">
                          {t("common:unknown")}
                        </span>
                      )}
                      <time
                        className="text-xs text-fg-subtle"
                        title={formatMessageTooltip(revision.createdAt, timezone)}
                      >
                        {formatMessageTime(revision.createdAt, timezone)}
                      </time>
                      {isDeleteMarker && (
                        <span className="rounded-full bg-danger-subtle px-1.5 py-0.5 text-xs font-medium text-danger">
                          {t("history_deleted")}
                        </span>
                      )}
                      {isLast && !isDeleteMarker && (
                        <span className="rounded-full bg-[var(--accent-light)] px-1.5 py-0.5 text-xs font-medium text-[var(--accent-text-on-light)] dark:bg-[var(--accent-dark)] dark:text-[var(--accent-text-dark)]">
                          {t("history_latest")}
                        </span>
                      )}
                    </div>

                    <div
                      className={`rounded-lg border px-3 py-2 ${isDeleteMarker ? "border-danger bg-danger-subtle" : "border-line bg-surface"}`}
                    >
                      {isDeleteMarker ? (
                        <p className="text-sm italic text-fg-muted">{t("message_deleted")}</p>
                      ) : (
                        <MessageContent text={revision.body} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </Modal>
  );
}
