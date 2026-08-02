import { useQuery } from "@tanstack/react-query";
import {
  fetchAdminAuditLog,
  fetchAdminAuditActions,
  type AdminAuditResponse,
} from "@/api/adminAudit";
import { queryKeys } from "@/queries/queryKeys";

export function useAdminAuditLog(action: string, page: number) {
  return useQuery<AdminAuditResponse>({
    queryKey: queryKeys.adminAuditLog(action, page),
    queryFn: () => fetchAdminAuditLog({ action: action || undefined, page }),
    staleTime: 0,
    gcTime: 60 * 1000,
  });
}

export function useAdminAuditActions() {
  return useQuery<{ actions: string[] }>({
    queryKey: queryKeys.adminAuditActions(),
    queryFn: fetchAdminAuditActions,
    staleTime: Infinity,
  });
}
