import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";

interface Props {
  secret: string;
  onClose: () => void;
}

export function SecretRevealModal({ secret, onClose }: Props) {
  const { t } = useTranslation("admin");
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Modal title={t("webhook_secret_title")} onClose={onClose} size="lg">
      {(close) => (
        <>
          <p className="mb-4 text-sm font-semibold text-amber-700 dark:text-amber-400">
            {t("webhook_secret_warning")}
          </p>

          <div className="mb-4 flex items-center gap-2 rounded-md border border-line bg-surface p-3 font-mono text-sm">
            <span className="flex-1 break-all select-all text-fg dark:text-white">{secret}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded bg-accent-gradient px-3 py-1 text-xs font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
            >
              {copied ? t("webhook_secret_copied") : t("webhook_secret_copy")}
            </button>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={close}
              className="rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-fg hover:bg-raised"
            >
              {t("webhook_secret_done")}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
