import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminServerConfig,
  patchAdminServerConfig,
  sendAdminTestEmail,
  type AdminServerConfig,
  type AdminServerConfigPatch,
} from "@/api/adminServerConfig";
import { queryKeys } from "@/queries/queryKeys";

export function useAdminServerConfig() {
  return useQuery<AdminServerConfig>({
    queryKey: queryKeys.adminServerConfig(),
    queryFn: fetchAdminServerConfig,
  });
}

export function usePatchAdminServerConfig() {
  const qc = useQueryClient();
  return useMutation<AdminServerConfig, Error, AdminServerConfigPatch>({
    mutationFn: patchAdminServerConfig,
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.adminServerConfig(), data);
      void qc.invalidateQueries({ queryKey: queryKeys.serverInfo() });
      void qc.invalidateQueries({ queryKey: queryKeys.adminSetupStatus() });
    },
  });
}

export function useSendAdminTestEmail() {
  return useMutation<{ ok: boolean; error: string | null }, Error, string>({
    mutationFn: sendAdminTestEmail,
  });
}
