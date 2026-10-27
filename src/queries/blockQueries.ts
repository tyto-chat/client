import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type Query,
  type QueryClient,
} from "@tanstack/react-query";
import { blockUser, fetchBlockedUsers, fetchBlockStatus, unblockUser } from "@/api/blocks";
import { ApiError } from "@/api/client";
import { useHasAccessToken } from "@/api/tokenStore";
import { useOptionalAuthContext } from "@/context/AuthContext";
import { queryKeys } from "@/queries/queryKeys";
import type { BlockedUser } from "@/types/api";
import {
  readStoredBlockedIds,
  subscribeStoredBlockedIds,
  updateStoredBlockedIds,
  writeStoredBlockedIds,
} from "@/utils/blockedIdsStore";
import { StaleTime } from "./staleTimes";

const EMPTY_IDS: ReadonlySet<number> = new Set();

export const BLOCKS_LOADER_WAIT_MS = 300;

async function fetchBlockedUsersOrNone(): Promise<BlockedUser[]> {
  try {
    return await fetchBlockedUsers();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
}

export async function prefetchBlockedUsers(
  queryClient: QueryClient,
  waitAtMostMs?: number,
): Promise<void> {
  const fetched = queryClient.prefetchQuery({
    queryKey: queryKeys.blocks(),
    queryFn: fetchBlockedUsersOrNone,
    staleTime: StaleTime.long,
    retry: false,
  });
  if (waitAtMostMs === undefined) return fetched;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, waitAtMostMs);
  });
  await Promise.race([fetched, budget]);
  clearTimeout(timer);
}

export function useBlockedUsers() {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.blocks(),
    queryFn: fetchBlockedUsersOrNone,
    enabled: hasToken,
    staleTime: StaleTime.long,
  });
}

export function useBlockedUserIds(): ReadonlySet<number> {
  const { data } = useBlockedUsers();
  const userId = useOptionalAuthContext()?.user?.id ?? null;
  const fetchedIds = useMemo(
    () => (data ? data.filter((b) => b.inEffect).map((b) => b.userId) : null),
    [data],
  );
  const storedIds = useSyncExternalStore(
    subscribeStoredBlockedIds,
    () => (userId !== null ? readStoredBlockedIds(userId) : null),
    () => null,
  );

  useEffect(() => {
    if (userId !== null && fetchedIds) writeStoredBlockedIds(userId, fetchedIds);
  }, [userId, fetchedIds]);

  return useMemo(() => {
    const ids = fetchedIds ?? storedIds;
    return ids && ids.length > 0 ? new Set(ids) : EMPTY_IDS;
  }, [fetchedIds, storedIds]);
}

export function useBlockStatus(userId: number | null) {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.blockStatus(userId ?? -1),
    queryFn: () => fetchBlockStatus(userId as number),
    enabled: hasToken && userId !== null,
  });
}

const CONVERSATIONS_ROOT = queryKeys.conversations()[0];

function isConversationListOrDetail(query: Query): boolean {
  return query.queryKey[0] === CONVERSATIONS_ROOT && query.queryKey.length <= 2;
}

export function invalidateBlockDependents(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.blocks() }),
    queryClient.invalidateQueries({ predicate: isConversationListOrDetail }),
  ]);
}

function applyConfirmedBlock(
  queryClient: QueryClient,
  userId: number | null,
  targetId: number,
  confirmed: BlockedUser | null,
): void {
  queryClient.setQueryData<BlockedUser[]>(queryKeys.blocks(), (old) => {
    if (!old) return old;
    const rest = old.filter((b) => b.userId !== targetId);
    return confirmed ? [...rest, confirmed] : rest;
  });
  if (userId === null) return;
  updateStoredBlockedIds(userId, (ids) => {
    const rest = ids.filter((id) => id !== targetId);
    return confirmed?.inEffect ? [...rest, targetId] : rest;
  });
}

function useBlockMutation(mutationFn: (targetId: number) => Promise<BlockedUser | null>) {
  const queryClient = useQueryClient();
  const userId = useOptionalAuthContext()?.user?.id ?? null;
  return useMutation({
    mutationFn,
    onSuccess: async (confirmed, targetId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.blocks() });
      applyConfirmedBlock(queryClient, userId, targetId, confirmed);
      return invalidateBlockDependents(queryClient);
    },
  });
}

export function useBlockUser() {
  return useBlockMutation((targetId) => blockUser(targetId));
}

export function useUnblockUser() {
  return useBlockMutation(async (targetId) => {
    await unblockUser(targetId);
    return null;
  });
}
