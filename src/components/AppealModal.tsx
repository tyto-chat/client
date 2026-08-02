import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/icons";
import { useCreateAppeal } from "@/queries/appealQueries";
import { getApiErrorMessage } from "@/api/client";
import { useNotification } from "@/context/NotificationContext";

interface Props {
  actionId: number;
  onClose: () => void;
}

export function AppealModal({ actionId, onClose }: Props) {
  const { t } = useTranslation(["appeals", "common"]);
  const { notify } = useNotification();
  const createAppeal = useCreateAppeal();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(close: () => void) {
    if (reason.trim().length === 0) return;
    setError(null);
    createAppeal.mutate(
      { actionId, reason: reason.trim() },
      {
        onSuccess: () => {
          notify(t("submitted_toast"), "success");
          close();
        },
        onError: (err) => setError(getApiErrorMessage(err) ?? t("submit_failed")),
      },
    );
  }

  return (
    <Modal title={t("appeal_title")} onClose={onClose} size="sm">
      {(close) => (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">{t("appeal_intro")}</p>
          {error && (
            <p className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={2000}
            autoFocus
            placeholder={t("reason_placeholder")}
            aria-label={t("reason_placeholder")}
            className="w-full rounded-md bg-canvas px-3 py-2 text-sm ring-1 ring-inset ring-line"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="text-sm text-fg-muted hover:text-fg">
              {t("common:cancel")}
            </button>
            <button
              type="button"
              disabled={reason.trim().length === 0 || createAppeal.isPending}
              onClick={() => handleSubmit(close)}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
            >
              {createAppeal.isPending && <Spinner size={14} className="text-on-accent" />}
              {t("submit_appeal")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
