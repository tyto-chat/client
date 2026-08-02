import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ReportsInbox } from "@/components/reports/ReportsInbox";
import { useAdminReports, useUpdateReport } from "@/queries/reportQueries";
import { useNotification } from "@/context/NotificationContext";
import type { ReportStatus } from "@/types/api";

export const Route = createFileRoute("/admin/reports")({
  component: AdminReportsPage,
});

function AdminReportsPage() {
  const { t } = useTranslation(["admin", "reports"]);
  const { notify } = useNotification();
  const [status, setStatus] = useState<ReportStatus | "all">("open");

  const { data: reports = [], isLoading, isFetching } = useAdminReports(status);
  const updateReport = useUpdateReport();

  function handleAction(id: number, next: ReportStatus, note?: string) {
    const toastKey =
      next === "resolved"
        ? "reports:toast.resolved"
        : next === "dismissed"
          ? "reports:toast.dismissed"
          : "reports:toast.escalated";
    updateReport.mutate(
      { id, status: next, resolutionNote: note },
      {
        onSuccess: () => notify(t(toastKey), "success"),
        onError: () => notify(t("reports:action_failed"), "error"),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-2xl font-bold">{t("admin:nav_reports")}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t("reports:admin_intro")}</p>
      </header>
      <ReportsInbox
        reports={reports}
        isLoading={isLoading}
        isFetching={isFetching}
        status={status}
        onStatusChange={setStatus}
        showCommunity
        canEscalate={false}
        canCloseEscalated
        onAction={handleAction}
        actionPending={updateReport.isPending}
      />
    </div>
  );
}
