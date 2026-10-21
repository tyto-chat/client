import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useApiTransport } from "@/hooks/useApiTransport";

const DISMISS_KEY = "tyto:http1-warning-dismissed";
const DOCS_URL = "https://tyto.chat/docs/reverse-proxy";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function TransportWarningBanner() {
  const { t } = useTranslation();
  const transport = useApiTransport();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (transport !== "legacy" || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage unavailable: dismiss for this render only */
    }
  };

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <div>
        <span className="font-semibold">{t("http1_banner_title")}</span>{" "}
        <span>{t("http1_banner_text")}</span>{" "}
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline hover:no-underline"
        >
          {t("http1_banner_docs")}
        </a>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("close")}
        className="shrink-0 rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-900"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
