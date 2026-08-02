import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReport,
  fetchAdminReports,
  fetchCommunityReports,
  updateReport,
} from "@/api/reports";
import { queryKeys } from "@/queries/queryKeys";
import type { ReportCategory, ReportStatus } from "@/types/api";

export function useCommunityReports(communityId: string, status: ReportStatus | "all", page = 1) {
  return useQuery({
    queryKey: [...queryKeys.communityReports(communityId, status), page],
    queryFn: () => fetchCommunityReports(communityId, status === "all" ? undefined : status, page),
    staleTime: StaleTime.short,
    placeholderData: (prev) => prev,
  });
}

export function useAdminReports(status: ReportStatus | "all", page = 1) {
  return useQuery({
    queryKey: [...queryKeys.adminReports(status), page],
    queryFn: () => fetchAdminReports(status === "all" ? undefined : status, page),
    staleTime: StaleTime.short,
    placeholderData: (prev) => prev,
  });
}

export function useCreateReport() {
  return useMutation({
    mutationFn: (data: {
      messageId?: string;
      userId?: number;
      communityIdentifier?: string;
      category: ReportCategory;
      comment?: string;
    }) => createReport(data),
  });
}

export function useUpdateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number; status: ReportStatus; resolutionNote?: string }) =>
      updateReport(data.id, { status: data.status, resolutionNote: data.resolutionNote }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["communities"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
    },
  });
}
