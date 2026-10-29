import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";

interface Props {
  names: string;
  group: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PlainFallbackDialog({ names, group, onConfirm, onCancel }: Props) {
  const { t } = useTranslation(["conversation", "common"]);
  return (
    <Modal title={t("e2ee_plain_title")} onClose={onCancel} size="sm">
      {(close) => (
        <div data-testid="e2ee-plain-fallback-dialog" className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">
            {group ? t("e2ee_plain_group_body") : t("e2ee_plain_fallback_body", { names })}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-fg-muted hover:bg-raised"
            >
              {t("common:cancel")}
            </button>
            <button
              type="button"
              data-testid="e2ee-plain-fallback-confirm"
              onClick={onConfirm}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90"
            >
              {t("e2ee_plain_confirm")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
