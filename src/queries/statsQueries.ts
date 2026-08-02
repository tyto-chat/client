import { StaleTime } from "./staleTimes";
import { useQuery } from "@tanstack/react-query";
import { fetchStats } from "@/api/stats";
import { queryKeys } from "@/queries/queryKeys";

export function useStats() {
  return useQuery({
    queryKey: queryKeys.stats(),
    queryFn: fetchStats,
    staleTime: StaleTime.short,
    refetchInterval: 30_000,
  });
}
