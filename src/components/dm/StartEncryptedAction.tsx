import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useE2ee } from "@/e2ee/e2eeContextValue";
import { e2eeErrorKey } from "@/e2ee/e2eeErrors";
import {
  useStartEncryptedWithSameParticipants,
  type StartEncryptedResult,
} from "@/queries/conversationQueries";
import type { Conversation } from "@/types/api";

export function StartEncryptedAction({ conversation }: { conversation: Conversation }) {
  const { t } = useTranslation("conversation");
  const { user } = useAuth();
  const navigate = useNavigate();
  const { identity, availability } = useE2ee();
  const start = useStartEncryptedWithSameParticipants(
    conversation,
    user?.id,
    identity,
    availability,
  );
  const [explanation, setExplanation] = useState<string | null>(null);

  const names = (ids: number[]) =>
    ids
      .map((id) => conversation.members.find((m) => m.userId === id)?.profile?.name ?? `#${id}`)
      .join(", ");

  const explain = (result: StartEncryptedResult): string | null => {
    switch (result.kind) {
      case "opened":
        return null;
      case "group_not_available":
        return t("e2ee_start_group_not_available");
      case "unreachable":
        return t("e2ee_start_unreachable", { names: names(result.userIds) });
      case "not_ready":
        return t(
          result.availability === "unsupported" ? "e2ee_not_ready_web" : "e2ee_not_ready_restore",
        );
      case "blocked":
        return t("e2ee_blocked_generic");
    }
  };

  const onStart = () => {
    setExplanation(null);
    start.mutate(undefined, {
      onSuccess: (result) => {
        if (result.kind === "opened") {
          void navigate({
            to: "/dm/$conversationId",
            params: { conversationId: result.identifier },
          });
          return;
        }
        setExplanation(explain(result));
      },
      onError: (error) => setExplanation(t(e2eeErrorKey(error))),
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        data-testid="e2ee-start-encrypted"
        onClick={onStart}
        disabled={start.isPending}
        className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface disabled:opacity-50"
      >
        {t("e2ee_start_encrypted")}
      </button>
      {explanation !== null && (
        <p data-testid="e2ee-start-explanation" role="status" className="text-xs text-fg-muted">
          {explanation}
        </p>
      )}
    </div>
  );
}
