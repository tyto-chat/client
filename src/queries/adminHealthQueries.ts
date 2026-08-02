import { useQuery } from "@tanstack/react-query";
import { fetchAdminHealth, type AdminHealthResponse } from "@/api/adminHealth";
import { queryKeys } from "@/queries/queryKeys";

export function useAdminHealth() {
  return useQuery<AdminHealthResponse>({
    queryKey: queryKeys.adminHealth(),
    queryFn: fetchAdminHealth,
    staleTime: 0,
    gcTime: 60 * 1000,
  });
}
