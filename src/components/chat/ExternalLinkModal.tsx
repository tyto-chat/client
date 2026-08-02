import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";

interface Props {
  url: string;
  onClose: () => void;
}

export function ExternalLinkModal({ url, onClose }: Props) {
  const { t } = useTranslation(["channel", "common"]);

  function handleOpen() {
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <Modal title={t("external_link_title")} onClose={onClose} size="sm">
      {(close) => (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">{t("external_link_warning")}</p>
          <p className="break-all rounded-lg bg-surface px-3 py-2 font-mono text-xs text-fg">
            {url}
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={close}
              className="rounded-lg px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface"
            >
              {t("common:cancel")}
            </button>
            <button
              onClick={handleOpen}
              className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-[var(--accent-on)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              {t("open_link")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
