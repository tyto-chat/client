import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAdminAuditLog, useAdminAuditActions } from "@/queries/adminAuditQueries";
import type { AdminAuditRow } from "@/api/adminAudit";
import { Spinner } from "@/components/icons";

export const Route = createFileRoute("/admin/audit")({
  component: AdminAuditPage,
});

function AdminAuditPage() {
  const { t, i18n } = useTranslation("admin");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, refetch } = useAdminAuditLog(action, page);
  const { data: actionsData } = useAdminAuditActions();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  function fmtDateTime(iso: string): string {
    return new Date(iso).toLocaleString(i18n.language, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t("nav_audit")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("audit_intro")}</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-40"
        >
          {isFetching ? t("loading") : t("refresh")}
        </button>
      </header>

      <div className="flex items-center gap-2">
        <label className="text-sm text-fg-muted">{t("audit_filter_action")}</label>
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="rounded-md bg-canvas ring-1 ring-inset ring-line px-2 py-1.5 text-sm"
        >
          <option value="">{t("audit_filter_all")}</option>
          {(actionsData?.actions ?? []).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {data && (
          <span className="ml-auto text-sm text-fg-muted">
            {t("audit_count", { count: data.total })}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner size={16} /> {t("loading")}
        </div>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <p className="text-sm text-fg-muted">{t("audit_empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">{t("audit_col_when")}</th>
                <th className="px-4 py-2 font-semibold">{t("audit_col_actor")}</th>
                <th className="px-4 py-2 font-semibold">{t("audit_col_action")}</th>
                <th className="px-4 py-2 font-semibold">{t("audit_col_target")}</th>
                <th className="px-4 py-2 font-semibold">{t("audit_col_details")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.rows.map((row) => (
                <AuditRow key={row.id} row={row} when={fmtDateTime(row.createdAt)} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-fg-muted">
          <span>{t("pagination_label", { page, totalPages })}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-line px-3 py-1 hover:bg-surface disabled:opacity-40"
            >
              {t("pagination_prev")}
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-line px-3 py-1 hover:bg-surface disabled:opacity-40"
            >
              {t("pagination_next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditRow({ row, when, t }: { row: AdminAuditRow; when: string; t: TFunction<"admin"> }) {
  const actorLabel = row.actor
    ? (row.actor.name ?? row.actor.email ?? `#${row.actor.id}`)
    : t("audit_actor_unknown");
  const target =
    row.targetType !== null
      ? `${row.targetType}${row.targetId !== null ? ` #${row.targetId}` : ""}`
      : "—";
  const details =
    row.payload && Object.keys(row.payload).length > 0 ? JSON.stringify(row.payload) : "—";

  return (
    <tr className="align-top">
      <td className="whitespace-nowrap px-4 py-2 text-fg-muted">{when}</td>
      <td className="px-4 py-2">{actorLabel}</td>
      <td className="px-4 py-2">
        <code className="rounded bg-surface px-1.5 py-0.5 text-xs">{row.action}</code>
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-fg-muted">{target}</td>
      <td className="max-w-xs truncate px-4 py-2 font-mono text-xs text-fg-muted" title={details}>
        {details}
      </td>
    </tr>
  );
}
