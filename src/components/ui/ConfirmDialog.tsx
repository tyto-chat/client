import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";

export interface ConfirmOptions {
  title: React.ReactNode;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function ConfirmDialog({
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation("common");
  return (
    <Modal title={title} onClose={onCancel} size="sm">
      {(close) => (
        <div className="flex flex-col gap-4">
          {message && <p className="text-sm text-fg-muted">{message}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-fg-muted hover:bg-raised"
            >
              {cancelLabel ?? t("cancel")}
            </button>
            <button
              type="button"
              data-testid="confirm-dialog-confirm"
              onClick={onConfirm}
              className={
                destructive
                  ? "rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90"
                  : "rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-glow hover:opacity-90"
              }
            >
              {confirmLabel ?? t("confirm")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
