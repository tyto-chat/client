import { useTranslation } from "react-i18next";
import { useUnblockUser } from "@/queries/blockQueries";
import type { Conversation } from "@/types/api";

interface Props {
  reason: Conversation["readOnlyReason"];
  otherUserId: number | null;
}

export function ConversationReadOnlyBanner({ reason, otherUserId }: Props) {
  const { t } = useTranslation("conversation");
  const unblock = useUnblockUser();
  const canUnblock = reason === "blocked" && otherUserId !== null;

  return (
    <div
      data-testid="conversation-read-only-banner"
      className="flex items-center justify-between gap-3 border-t border-line bg-canvas px-4 py-3"
    >
      <p className="text-sm text-fg-muted">
        {canUnblock ? t("read_only_blocked") : t("read_only_unavailable")}
      </p>
      {canUnblock && (
        <button
          type="button"
          data-testid="conversation-read-only-unblock"
          onClick={() => unblock.mutate(otherUserId)}
          disabled={unblock.isPending}
          className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface disabled:opacity-50"
        >
          {t("read_only_unblock")}
        </button>
      )}
    </div>
  );
}
