import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/icons";
import { useCreateReport } from "@/queries/reportQueries";
import { useNotification } from "@/context/NotificationContext";
import type { ReportCategory } from "@/types/api";

const CATEGORIES: ReportCategory[] = [
  "harassment",
  "spam",
  "rule_violation",
  "illegal_content",
  "other",
];

interface Props {
  target: { messageId: string } | { userId: number; communityIdentifier?: string };
  onClose: () => void;
}

export function ReportModal({ target, onClose }: Props) {
  const { t } = useTranslation(["reports", "common"]);
  const { notify } = useNotification();
  const createReport = useCreateReport();
  const [category, setCategory] = useState<ReportCategory>("harassment");
  const [comment, setComment] = useState("");

  const commentRequired = category === "other";
  const canSubmit = !commentRequired || comment.trim().length > 0;

  function handleSubmit(close: () => void) {
    createReport.mutate(
      {
        ...("messageId" in target
          ? { messageId: target.messageId }
          : { userId: target.userId, communityIdentifier: target.communityIdentifier }),
        category,
        comment: comment.trim() || undefined,
      },
      {
        onSuccess: () => {
          notify(t("submitted_toast"), "success");
          close();
        },
        onError: () => notify(t("submit_failed"), "error"),
      },
    );
  }

  return (
    <Modal title={t("report_title")} onClose={onClose} size="sm">
      {(close) => (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">{t("report_intro")}</p>
          <fieldset className="space-y-1.5">
            {CATEGORIES.map((c) => (
              <label
                key={c}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface"
              >
                <input
                  type="radio"
                  name="report-category"
                  checked={category === c}
                  onChange={() => setCategory(c)}
                />
                <span className="font-medium text-fg">{t(`category.${c}`)}</span>
              </label>
            ))}
          </fieldset>
          <div>
            <label className="mb-1 block text-sm text-fg-muted">
              {t("comment_label")}{" "}
              {commentRequired ? (
                <span className="text-danger">*</span>
              ) : (
                <span className="text-fg-subtle">{t("common:optional")}</span>
              )}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={t("comment_placeholder")}
              aria-label={t("comment_label")}
              className="w-full rounded-md bg-canvas px-3 py-1.5 text-sm ring-1 ring-inset ring-line"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="text-sm text-fg-muted hover:text-fg">
              {t("common:cancel")}
            </button>
            <button
              type="button"
              disabled={!canSubmit || createReport.isPending}
              onClick={() => handleSubmit(close)}
              className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
            >
              {createReport.isPending && <Spinner size={14} className="text-white" />}
              {t("submit_report")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
