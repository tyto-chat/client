import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type { Appeal, AppealStatus, HydraCollection } from "@/types/api";

export function createAppeal(actionId: number, reason: string): Promise<Appeal> {
  return apiClient.post<Appeal>(`/api/moderation-actions/${actionId}/appeals`, { reason });
}

export async function fetchCommunityAppeals(
  communityId: string,
  status?: AppealStatus,
  page = 1,
): Promise<Appeal[]> {
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set("status", status);
  const data = await apiClient.get<HydraCollection<Appeal>>(
    `/api/communities/${communityId}/appeals?${params.toString()}`,
  );
  return unwrapCollection(data);
}

export function updateAppeal(
  id: number,
  data: { status: AppealStatus; resolutionNote?: string },
): Promise<Appeal> {
  return apiClient.patch<Appeal>(`/api/appeals/${id}`, data);
}
