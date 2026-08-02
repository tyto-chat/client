import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ReportsInbox } from "@/components/reports/ReportsInbox";
import { useCommunityReports, useUpdateReport } from "@/queries/reportQueries";
import { useNotification } from "@/context/NotificationContext";
import { useAuth } from "@/hooks/useAuth";
import type { ReportStatus } from "@/types/api";

interface Props {
  communityId: string;
}

export function ReportsPanel({ communityId }: Props) {
  const { t } = useTranslation("reports");
  const { notify } = useNotification();
  const { user } = useAuth();
  const [status, setStatus] = useState<ReportStatus | "all">("open");

  const { data: reports = [], isLoading, isFetching } = useCommunityReports(communityId, status);
  const updateReport = useUpdateReport();

  const isGlobalAdmin = user?.roles?.includes("ROLE_ADMIN") ?? false;

  function handleAction(id: number, next: ReportStatus, note?: string) {
    const toastKey =
      next === "resolved"
        ? "toast.resolved"
        : next === "dismissed"
          ? "toast.dismissed"
          : "toast.escalated";
    updateReport.mutate(
      { id, status: next, resolutionNote: note },
      {
        onSuccess: () => notify(t(toastKey), "success"),
        onError: () => notify(t("action_failed"), "error"),
      },
    );
  }

  return (
    <ReportsInbox
      reports={reports}
      isLoading={isLoading}
      isFetching={isFetching}
      status={status}
      onStatusChange={setStatus}
      canEscalate
      canCloseEscalated={isGlobalAdmin}
      onAction={handleAction}
      actionPending={updateReport.isPending}
    />
  );
}
