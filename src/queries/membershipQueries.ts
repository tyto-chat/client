import { StaleTime } from "./staleTimes";
import { useQuery } from "@tanstack/react-query";
import { fetchCommunityMembership, fetchMyCommunityMemberships } from "@/api/membership";
import { queryKeys } from "@/queries/queryKeys";
import { useHasAccessToken } from "@/api/tokenStore";

export function useMyCommunityMemberships() {
  const hasToken = useHasAccessToken();

  return useQuery({
    queryKey: queryKeys.myMemberships(),
    queryFn: fetchMyCommunityMemberships,
    enabled: hasToken,
    staleTime: StaleTime.long,
  });
}

export function useCommunityMembership(identifier: string) {
  const hasToken = useHasAccessToken();

  return useQuery({
    queryKey: queryKeys.communityMembership(identifier),
    queryFn: () => fetchCommunityMembership(identifier),
    enabled: hasToken && !!identifier,
    staleTime: StaleTime.long,
  });
}
