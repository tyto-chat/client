import { useQuery } from "@tanstack/react-query";
import { fetchSetupStatus, type SetupStatus } from "@/api/setupStatus";
import { queryKeys } from "@/queries/queryKeys";

export function useSetupStatus(enabled: boolean) {
  return useQuery<SetupStatus>({
    queryKey: queryKeys.adminSetupStatus(),
    queryFn: fetchSetupStatus,
    enabled,
    refetchOnWindowFocus: true,
  });
}
