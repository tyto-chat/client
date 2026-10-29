import { useTranslation } from "react-i18next";
import { useUnblockUser } from "@/queries/blockQueries";
import { useNotification } from "@/context/NotificationContext";
import { StartEncryptedAction } from "@/components/dm/StartEncryptedAction";
import type { Conversation } from "@/types/api";

export type ReadOnlyBannerReason = Conversation["readOnlyReason"] | "self_refuses";

interface Props {
  reason: ReadOnlyBannerReason;
  otherUserId: number | null;
  conversation?: Conversation;
}

const ENCRYPTION_REASONS = {
  operator_required: "read_only_operator_required",
  participant_refuses_plain: "read_only_participant_refuses",
  self_refuses: "read_only_self_refuses",
} as const;

export function ConversationReadOnlyBanner({ reason, otherUserId, conversation }: Props) {
  const { t } = useTranslation(["conversation", "community"]);
  const { notify } = useNotification();
  const unblock = useUnblockUser();
  const canUnblock = reason === "blocked" && otherUserId !== null;
  const encryptionKey =
    reason !== null && reason in ENCRYPTION_REASONS
      ? ENCRYPTION_REASONS[reason as keyof typeof ENCRYPTION_REASONS]
      : null;

  return (
    <div
      data-testid="conversation-read-only-banner"
      data-reason={reason ?? ""}
      className="flex items-center justify-between gap-3 border-t border-line bg-canvas px-4 py-3"
    >
      <p className="text-sm text-fg-muted">
        {encryptionKey !== null
          ? t(encryptionKey)
          : canUnblock
            ? t("read_only_blocked")
            : t("read_only_unavailable")}
      </p>
      {encryptionKey !== null && conversation !== undefined && (
        <StartEncryptedAction conversation={conversation} />
      )}
      {canUnblock && (
        <button
          type="button"
          data-testid="conversation-read-only-unblock"
          onClick={() =>
            unblock.mutate(otherUserId, {
              onError: () => notify(t("community:block_failed"), "error"),
            })
          }
          disabled={unblock.isPending}
          className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface disabled:opacity-50"
        >
          {t("read_only_unblock")}
        </button>
      )}
    </div>
  );
}
