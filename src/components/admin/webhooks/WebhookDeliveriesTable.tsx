import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWebhookDeliveries } from "@/queries/webhookQueries";
import { Spinner } from "@/components/icons";
import type { WebhookDelivery } from "@/api/webhooks";

interface Props {
  webhookId: number;
}

type DeliveryStatus = WebhookDelivery["status"];

function StatusBadge({ status }: { status: DeliveryStatus }) {
  const { t } = useTranslation("admin");

  const classes: Record<DeliveryStatus, string> = {
    success: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    queued: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    pending: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  };

  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${classes[status]}`}>
      {t(`webhook_status_${status}`)}
    </span>
  );
}

function ExpandedRow({ delivery }: { delivery: WebhookDelivery }) {
  const { t } = useTranslation("admin");

  return (
    <tr>
      <td colSpan={7} className="border-b border-line bg-surface px-4 py-3">
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t("webhook_delivery_payload")}
            </p>
            <pre className="max-h-48 overflow-y-auto rounded bg-canvas ring-1 ring-inset ring-line p-3 text-xs text-fg">
              {JSON.stringify(delivery.requestPayload, null, 2)}
            </pre>
          </div>

          {delivery.responseBody && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                {t("webhook_delivery_response")}
              </p>
              <pre className="max-h-32 overflow-y-auto rounded bg-canvas ring-1 ring-inset ring-line p-3 text-xs text-fg">
                {delivery.responseBody}
              </pre>
            </div>
          )}

          {delivery.error && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-500">
                {t("webhook_delivery_error")}
              </p>
              <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                {delivery.error}
              </p>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export function WebhookDeliveriesTable({ webhookId }: Props) {
  const { t, i18n } = useTranslation("admin");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading } = useWebhookDeliveries(webhookId, page);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleString(i18n.language, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function toggleRow(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg bg-canvas ring-1 ring-inset ring-line">
        <table className="min-w-full text-sm">
          <thead className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">
            <tr>
              <th className="px-4 py-3">{t("webhook_col_time")}</th>
              <th className="px-4 py-3">{t("webhook_col_actor")}</th>
              <th className="px-4 py-3">{t("webhook_col_status")}</th>
              <th className="px-4 py-3 text-right">{t("webhook_col_http_code")}</th>
              <th className="px-4 py-3 text-right">{t("webhook_col_attempts")}</th>
              <th className="px-4 py-3 text-right">{t("webhook_col_duration")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-fg-muted">
                  <Spinner size={16} /> {t("loading")}
                </td>
              </tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-fg-muted">
                  {t("webhook_deliveries_empty")}
                </td>
              </tr>
            )}
            {data?.items.map((delivery) => (
              <>
                <tr
                  key={delivery.id}
                  className="cursor-pointer hover:bg-surface"
                  onClick={() => toggleRow(delivery.id)}
                >
                  <td className="px-4 py-3 text-fg-muted">{fmtDate(delivery.createdAt)}</td>
                  <td className="px-4 py-3">
                    {delivery.actorName ?? <span className="text-fg-subtle">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={delivery.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {delivery.httpCode ?? <span className="text-fg-subtle">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{delivery.attempts}</td>
                  <td className="px-4 py-3 text-right">
                    {delivery.durationMs != null ? (
                      `${delivery.durationMs}ms`
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-fg-subtle">
                      {expandedId === delivery.id ? "▲" : "▼"}
                    </span>
                  </td>
                </tr>
                {expandedId === delivery.id && (
                  <ExpandedRow key={`${delivery.id}-exp`} delivery={delivery} />
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-line px-3 py-1 text-sm hover:bg-surface disabled:opacity-40"
          >
            {t("pagination_prev")}
          </button>
          <span className="text-sm text-fg-muted">
            {t("pagination_label", { page, totalPages })}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-line px-3 py-1 text-sm hover:bg-surface disabled:opacity-40"
          >
            {t("pagination_next")}
          </button>
        </div>
      )}
    </div>
  );
}
