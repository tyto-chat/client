import { formatShortDate as formatDate } from "@/utils/dateFormat";
import { useTranslation } from "react-i18next";
import { useDataExportStatus, useRequestDataExport } from "@/queries/dataExportQueries";
import { downloadUrl } from "@/api/dataExport";
import { useNotification } from "@/context/NotificationContext";
import { ApiError } from "@/api/client";
import { Spinner } from "@/components/icons";
import { sectionHeading } from "@/components/preferences/panelStyles";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function DataExportSection() {
  const { t } = useTranslation(["settings", "common"]);
  const { notify } = useNotification();
  const { data: status } = useDataExportStatus();
  const requestExport = useRequestDataExport();

  async function onRequest() {
    try {
      await requestExport.mutateAsync();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 429 || e.status === 409)) {
        const body = e.body as { error?: string } | null;
        notify(body?.error ?? t("data_export_request_failed"), "error");
      } else {
        notify(t("data_export_request_failed"), "error");
      }
    }
  }

  const isProcessing = status?.status === "queued" || status?.status === "processing";
  const isReady = status?.status === "ready";

  return (
    <div className="flex flex-col gap-3">
      <h3 className={sectionHeading}>{t("data_export_section")}</h3>
      <p className="text-sm text-fg-muted">{t("data_export_intro")}</p>

      {isProcessing && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg">
          <Spinner size={16} />
          <span>
            {status?.status === "queued"
              ? t("data_export_status_queued")
              : t("data_export_status_processing")}
          </span>
        </div>
      )}

      {isReady && status?.downloadUrl && (
        <div className="flex flex-col gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 dark:border-green-700 dark:bg-green-900/30">
          <p className="text-sm text-green-700 dark:text-green-200">
            {t("data_export_status_ready_intro", {
              size: formatBytes(status.fileSize ?? 0),
              date: formatDate(status.expiresAt),
            })}
          </p>
          <a
            href={downloadUrl(status.downloadUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
          >
            {t("data_export_download")}
          </a>
        </div>
      )}

      {status?.status === "failed" && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
          {t("data_export_status_failed")}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => void onRequest()}
          disabled={requestExport.isPending || isProcessing}
          className="self-start rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg hover:bg-surface disabled:opacity-50"
        >
          {requestExport.isPending
            ? t("data_export_requesting")
            : isReady
              ? t("data_export_request_again")
              : t("data_export_action")}
        </button>
        <p className="text-xs text-fg-muted">{t("data_export_cooldown_hint")}</p>
      </div>
    </div>
  );
}
