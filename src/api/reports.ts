import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type { HydraCollection, Report, ReportCategory, ReportStatus } from "@/types/api";

export function createReport(data: {
  messageId?: string;
  userId?: number;
  communityIdentifier?: string;
  category: ReportCategory;
  comment?: string;
}): Promise<Report> {
  return apiClient.post<Report>("/api/reports", data);
}

export async function fetchCommunityReports(
  communityId: string,
  status?: ReportStatus,
  page = 1,
): Promise<Report[]> {
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set("status", status);
  const data = await apiClient.get<HydraCollection<Report>>(
    `/api/communities/${communityId}/reports?${params.toString()}`,
  );
  return unwrapCollection(data);
}

export async function fetchAdminReports(status?: ReportStatus, page = 1): Promise<Report[]> {
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set("status", status);
  const data = await apiClient.get<HydraCollection<Report>>(
    `/api/admin/reports?${params.toString()}`,
  );
  return unwrapCollection(data);
}

export function updateReport(
  id: number,
  data: { status: ReportStatus; resolutionNote?: string },
): Promise<Report> {
  return apiClient.patch<Report>(`/api/reports/${id}`, data);
}
