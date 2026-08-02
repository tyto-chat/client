import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAdminCommunity,
  fetchAdminCommunities,
  transferAdminCommunity,
  type AdminCommunityListParams,
  type AdminCommunityListResponse,
} from "@/api/adminCommunities";
import { queryKeys } from "@/queries/queryKeys";

export function useAdminCommunities(params: AdminCommunityListParams = {}) {
  return useQuery<AdminCommunityListResponse>({
    queryKey: queryKeys.adminCommunities(params),
    queryFn: () => fetchAdminCommunities(params),
  });
}

export function useDeleteAdminCommunity() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (identifier) => deleteAdminCommunity(identifier),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "communities"], exact: false });
    },
  });
}

export function useTransferAdminCommunity() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; demotedCount: number },
    Error,
    { identifier: string; newAdminUserId: number; demoteOthers?: boolean }
  >({
    mutationFn: ({ identifier, newAdminUserId, demoteOthers }) =>
      transferAdminCommunity(identifier, { newAdminUserId, demoteOthers }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "communities"], exact: false });
    },
  });
}
