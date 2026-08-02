import { StaleTime } from "./staleTimes";
import { useQuery } from "@tanstack/react-query";
import { fetchUser } from "@/api/users";
import { queryKeys } from "@/queries/queryKeys";

export function useUser(id: number | null) {
  return useQuery({
    queryKey: queryKeys.user(id ?? 0),
    queryFn: () => fetchUser(id!),
    enabled: id != null,
    staleTime: StaleTime.medium,
  });
}
