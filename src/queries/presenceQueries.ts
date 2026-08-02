import { StaleTime } from "./staleTimes";
import { parseMercureEvent } from "@/utils/parseMercureEvent";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchCommunityOnlineUsers,
  fetchCommunityPresenceSummary,
  fetchPresence,
  fetchPresenceHistory,
  setManualPresence,
  type CommunityOnlineUser,
  type CommunityPresenceSummary,
  type PresenceHistoryPoint,
} from "@/api/presence";
import { subscribeMercure } from "@/api/mercure";
import { getServerInfo } from "@/api/serverInfo";
import { getAccessToken, useHasAccessToken } from "@/api/tokenStore";
import { useAuthContext } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { queryKeys } from "@/queries/queryKeys";
import type { ManualPresenceStatus, PresenceMercureEvent, PresenceState } from "@/types/api";

export function useUserPresence(userId: number | null | undefined): PresenceState {
  const enabled = typeof userId === "number" && userId > 0;
  const { data } = useQuery<PresenceState>({
    queryKey: enabled ? queryKeys.userPresence(userId) : ["presence", "user", "disabled"],
    queryFn: () => "offline" as PresenceState,
    enabled: false,
    initialData: "offline",
    staleTime: Infinity,
  });
  return data ?? "offline";
}

export function usePresenceSubscription(userIds: readonly number[]): void {
  const queryClient = useQueryClient();
  const { t } = useTranslation("common");
  const { notify } = useNotification();
  const { mercureToken, refreshMercureToken } = useAuthContext();

  const idsKey = useMemo(() => {
    const unique = Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0)));
    unique.sort((a, b) => a - b);
    return unique.join(",");
  }, [userIds]);

  const stableIds = useMemo(() => (idsKey === "" ? [] : idsKey.split(",").map(Number)), [idsKey]);

  const loadPresence = useCallback(() => {
    if (stableIds.length === 0 || !getAccessToken()) return;
    fetchPresence(stableIds)
      .then(({ presences }) => {
        const seen = new Set<number>();
        for (const snap of presences) {
          seen.add(snap.userId);
          queryClient.setQueryData(queryKeys.userPresence(snap.userId), snap.state);
        }
        for (const id of stableIds) {
          if (!seen.has(id)) {
            queryClient.setQueryData(queryKeys.userPresence(id), "offline");
          }
        }
      })
      .catch(() => {});
  }, [stableIds, queryClient]);

  useEffect(() => {
    loadPresence();
  }, [loadPresence]);

  const loadPresenceRef = useRef(loadPresence);
  useEffect(() => {
    loadPresenceRef.current = loadPresence;
  });

  useEffect(() => {
    if (stableIds.length === 0 || !mercureToken) return;
    const topics = stableIds.map((id) => `/api/users/${id}/presence`);

    return subscribeMercure(
      topics,
      (event) => {
        const payload = parseMercureEvent<PresenceMercureEvent>(event);
        if (payload?.type === "presence") {
          queryClient.setQueryData(queryKeys.userPresence(payload.userId), payload.state);
        }
      },
      mercureToken,
      {
        onReconnect: () => loadPresenceRef.current(),
        onStaleToken: () => void refreshMercureToken(),
        onSustainedFailure: () => notify(t("presence.subscription_error"), "error"),
      },
      getServerInfo()?.mercureUrl,
    );
  }, [idsKey, stableIds, mercureToken, queryClient, refreshMercureToken, notify, t]);
}

export function useCommunityPresenceSummary(communityIdentifier: string | null | undefined) {
  return useQuery<CommunityPresenceSummary>({
    queryKey: queryKeys.communityPresenceSummary(communityIdentifier ?? ""),
    queryFn: () => fetchCommunityPresenceSummary(communityIdentifier!),
    enabled: !!communityIdentifier,
    refetchInterval: 30_000,
    staleTime: StaleTime.presence,
  });
}

export function usePresenceHistory(identifier: string | undefined, days: number) {
  return useQuery<PresenceHistoryPoint[]>({
    queryKey: queryKeys.presenceHistory(identifier ?? "", days),
    queryFn: async () => (await fetchPresenceHistory(identifier!, days)).samples,
    enabled: !!identifier,
    staleTime: 5 * 60_000,
  });
}

export function useCommunityOnlineUsers(communityIdentifier: string | null | undefined) {
  const hasToken = useHasAccessToken();
  return useQuery<CommunityOnlineUser[]>({
    queryKey: queryKeys.communityOnlineUsers(communityIdentifier ?? ""),
    queryFn: async () => (await fetchCommunityOnlineUsers(communityIdentifier!)).users,
    enabled: hasToken && !!communityIdentifier,
    refetchInterval: 30_000,
    staleTime: StaleTime.presence,
  });
}

export function useSetManualPresence() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();

  return useMutation({
    mutationFn: (status: ManualPresenceStatus | null) => setManualPresence(status),
    onSuccess: ({ state }) => {
      if (user) {
        queryClient.setQueryData(queryKeys.userPresence(user.id), state);
      }
    },
  });
}
