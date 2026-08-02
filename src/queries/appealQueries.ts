import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAppeal, fetchCommunityAppeals, updateAppeal } from "@/api/appeals";
import { queryKeys } from "@/queries/queryKeys";
import type { AppealStatus } from "@/types/api";

export function useCommunityAppeals(communityId: string, status: AppealStatus | "all", page = 1) {
  return useQuery({
    queryKey: [...queryKeys.communityAppeals(communityId, status), page],
    queryFn: () => fetchCommunityAppeals(communityId, status === "all" ? undefined : status, page),
    staleTime: StaleTime.short,
    placeholderData: (prev) => prev,
  });
}

export function useCreateAppeal() {
  return useMutation({
    mutationFn: (data: { actionId: number; reason: string }) =>
      createAppeal(data.actionId, data.reason),
  });
}

export function useUpdateAppeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number; status: AppealStatus; resolutionNote?: string }) =>
      updateAppeal(data.id, { status: data.status, resolutionNote: data.resolutionNote }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["communities"] });
    },
  });
}
