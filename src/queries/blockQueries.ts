import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { blockUser, fetchBlockedUsers, fetchBlockStatus, unblockUser } from "@/api/blocks";
import { useHasAccessToken } from "@/api/tokenStore";
import { queryKeys } from "@/queries/queryKeys";
import { StaleTime } from "./staleTimes";

const EMPTY_IDS: ReadonlySet<number> = new Set();

export function useBlockedUsers() {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.blocks(),
    queryFn: fetchBlockedUsers,
    enabled: hasToken,
    staleTime: StaleTime.long,
  });
}

export function useBlockedUserIds(): ReadonlySet<number> {
  const { data } = useBlockedUsers();
  return useMemo(() => {
    if (!data) return EMPTY_IDS;
    return new Set(data.filter((b) => b.inEffect).map((b) => b.userId));
  }, [data]);
}

export function useBlockStatus(userId: number | null) {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.blockStatus(userId ?? -1),
    queryFn: () => fetchBlockStatus(userId as number),
    enabled: hasToken && userId !== null,
  });
}

function useInvalidateBlocks() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.blocks() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations() }),
    ]);
}

export function useBlockUser() {
  const invalidate = useInvalidateBlocks();
  return useMutation({ mutationFn: (userId: number) => blockUser(userId), onSuccess: invalidate });
}

export function useUnblockUser() {
  const invalidate = useInvalidateBlocks();
  return useMutation({
    mutationFn: (userId: number) => unblockUser(userId),
    onSuccess: invalidate,
  });
}
