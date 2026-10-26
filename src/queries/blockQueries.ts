import { useEffect, useMemo } from "react";
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
import { getActiveIdentityKey } from "@/platform/activeIdentity";
import { queryKeys } from "@/queries/queryKeys";
import type { BlockedUser } from "@/types/api";
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

function storageKey(userId: number): string {
  return `tyto:blocked-ids:${getActiveIdentityKey() ?? "web"}:${userId}`;
}

function readStoredIds(userId: number): number[] | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "number") ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredIds(userId: number, ids: number[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(ids));
  } catch {
    /* storage unavailable */
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

  useEffect(() => {
    if (userId !== null && fetchedIds) writeStoredIds(userId, fetchedIds);
  }, [userId, fetchedIds]);

  return useMemo(() => {
    const ids = fetchedIds ?? (userId !== null ? readStoredIds(userId) : null);
    return ids && ids.length > 0 ? new Set(ids) : EMPTY_IDS;
  }, [fetchedIds, userId]);
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

function useInvalidateBlocks() {
  const queryClient = useQueryClient();
  return () => invalidateBlockDependents(queryClient);
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
