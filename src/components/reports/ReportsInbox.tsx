import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/Avatar";
import { avatarUrl } from "@/api/client";
import { Spinner, FlagIcon } from "@/components/icons";
import { useTimezone } from "@/context/TimezoneContext";
import { formatMessageTooltip } from "@/utils/dateFormat";
import type { Report, ReportStatus } from "@/types/api";

const FILTERS: (ReportStatus | "all")[] = ["open", "escalated", "resolved", "dismissed", "all"];

const CATEGORY_COLORS: Record<Report["category"], string> = {
  illegal_content: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  harassment: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  spam: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  rule_violation: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  other: "bg-surface text-fg-muted",
};

const STATUS_COLORS: Record<ReportStatus, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  escalated: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200",
  resolved: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  dismissed: "bg-surface text-fg-muted",
};

interface Props {
  reports: Report[];
  isLoading: boolean;
  isFetching: boolean;
  status: ReportStatus | "all";
  onStatusChange: (status: ReportStatus | "all") => void;
  showCommunity?: boolean;
  canEscalate?: boolean;
  canCloseEscalated?: boolean;
  onAction: (id: number, status: ReportStatus, note?: string) => void;
  actionPending: boolean;
}

export function ReportsInbox({
  reports,
  isLoading,
  isFetching,
  status,
  onStatusChange,
  showCommunity = false,
  canEscalate = false,
  canCloseEscalated = true,
  onAction,
  actionPending,
}: Props) {
  const { t } = useTranslation("reports");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 border-b border-line">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => onStatusChange(f)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              status === f
                ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {t(`filter.${f}`)}
            {status === f && isFetching && (
              <Spinner size={12} className="ml-1.5 inline text-[var(--accent)]" />
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size={28} className="text-[var(--accent)]" />
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-fg-muted">
          <FlagIcon size={28} className="text-fg-subtle" />
          <p className="text-sm">{t("empty")}</p>
        </div>
      ) : (
        <div className="flex max-h-[60vh] flex-col divide-y divide-line overflow-y-auto">
          {reports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              showCommunity={showCommunity}
              canEscalate={canEscalate}
              canCloseEscalated={canCloseEscalated}
              onAction={onAction}
              actionPending={actionPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RowProps {
  report: Report;
  showCommunity: boolean;
  canEscalate: boolean;
  canCloseEscalated: boolean;
  onAction: (id: number, status: ReportStatus, note?: string) => void;
  actionPending: boolean;
}

function ReportRow({
  report,
  showCommunity,
  canEscalate,
  canCloseEscalated,
  onAction,
  actionPending,
}: RowProps) {
  const { t } = useTranslation("reports");
  const { timezone } = useTimezone();
  const [note, setNote] = useState("");
  const canClose = report.status === "open" || (report.status === "escalated" && canCloseEscalated);
  const canEscalateNow = report.status === "open" && canEscalate;
  const showActions = canClose || canEscalateNow;

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[report.category]}`}
        >
          {t(`category.${report.category}`)}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[report.status]}`}
        >
          {t(`status.${report.status}`)}
        </span>
        {showCommunity && report.communityName && (
          <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-fg-muted">
            {report.communityName}
          </span>
        )}
        <span
          className="ml-auto text-xs text-fg-subtle"
          title={formatMessageTooltip(report.createdAt, timezone)}
        >
          {new Date(report.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-fg-muted">{t("reported_user")}:</span>
        <Avatar
          name={report.reportedUser.profile.name}
          colorKey={report.reportedUser.profile["@id"]}
          imageUrl={avatarUrl(report.reportedUser.profile.avatar?.contentUrl ?? null, "sm")}
          size="xs"
        />
        <span className="font-medium text-fg">{report.reportedUser.profile.name}</span>
        {report.reporter && (
          <span className="text-xs text-fg-subtle">
            · {t("reported_by")} {report.reporter.profile.name}
          </span>
        )}
      </div>

      {report.messageTextSnapshot != null && (
        <blockquote className="border-l-2 border-line pl-3 text-sm text-fg-muted">
          <p className="line-clamp-4 whitespace-pre-wrap">{report.messageTextSnapshot}</p>
          {report.messageId && (
            <Link
              to="/m/$messageId"
              params={{ messageId: report.messageId }}
              className="text-xs text-accent hover:underline"
            >
              {report.messageDeleted ? t("view_deleted_message") : t("view_message")}
            </Link>
          )}
        </blockquote>
      )}

      {report.comment && (
        <p className="text-sm text-fg">
          <span className="text-fg-muted">{t("reporter_note")}:</span> {report.comment}
        </p>
      )}

      {report.resolutionNote && (
        <p className="text-xs text-fg-subtle">
          {t("resolution_note")}: {report.resolutionNote}
          {report.resolvedBy && ` — ${report.resolvedBy.profile.name}`}
        </p>
      )}

      {showActions && (
        <div className="flex flex-col gap-2 rounded-lg bg-surface p-2">
          {canClose && (
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder={t("resolution_note_placeholder")}
              aria-label={t("resolution_note_placeholder")}
              className="w-full rounded-md bg-canvas px-2.5 py-1 text-sm ring-1 ring-inset ring-line"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {canClose && (
              <>
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={() => onAction(report.id, "resolved", note.trim() || undefined)}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  {t("action_resolve")}
                </button>
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={() => onAction(report.id, "dismissed", note.trim() || undefined)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:bg-canvas disabled:opacity-40"
                >
                  {t("action_dismiss")}
                </button>
              </>
            )}
            {canEscalateNow && (
              <button
                type="button"
                disabled={actionPending}
                onClick={() => onAction(report.id, "escalated")}
                className="rounded-lg border border-purple-300 px-3 py-1.5 text-sm font-medium text-purple-700 transition hover:bg-purple-50 disabled:opacity-40 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900/30"
              >
                {t("action_escalate")}
              </button>
            )}
          </div>
          {report.status === "escalated" && !canCloseEscalated && (
            <p className="text-xs text-fg-subtle">{t("escalated_admin_only")}</p>
          )}
        </div>
      )}
      {report.status === "escalated" && !canCloseEscalated && !showActions && (
        <p className="rounded-lg bg-surface p-2 text-xs text-fg-subtle">
          {t("escalated_admin_only")}
        </p>
      )}
    </div>
  );
}
