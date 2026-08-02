import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { uuidFromIri } from "@/api/hydra";
import { buildEmbedSnippet } from "@/utils/embedSnippet";

interface Props {
  messageIri: string;
  authorName: string;
  fallbackText: string;
  channelLabel: string;
  onClose: () => void;
}

export function EmbedMessageModal({
  messageIri,
  authorName,
  fallbackText,
  channelLabel,
  onClose,
}: Props) {
  const { t } = useTranslation("channel");
  const [copied, setCopied] = useState(false);

  const uuid = uuidFromIri(messageIri);
  const snippet = buildEmbedSnippet({
    origin: window.location.origin,
    uuid,
    fallbackText,
    authorName,
    channelLabel,
  });

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <Modal title={t("embed_modal_title")} onClose={onClose} size="lg">
      {() => (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">{t("embed_modal_hint")}</p>
          <textarea
            data-testid="embed-snippet"
            readOnly
            rows={8}
            value={snippet}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-fg"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void copySnippet()}
              className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
            >
              {copied ? t("embed_copied") : t("embed_copy")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
