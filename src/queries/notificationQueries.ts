import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchNotifications,
  fetchUnreadCounts,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/api/notifications";
import { queryKeys } from "@/queries/queryKeys";
import { useHasAccessToken } from "@/api/tokenStore";
import type { AppNotification } from "@/types/api";

type UnreadCounts = { counts: Record<string, number> } | undefined;

export function useCommunityNotifications(communityIdentifier: string) {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.notifications(communityIdentifier),
    queryFn: () => fetchNotifications(communityIdentifier),
    enabled: hasToken,
  });
}

export function useUnreadMentionChannels(communityIdentifier: string): Set<string> {
  const { data } = useCommunityNotifications(communityIdentifier);
  return useMemo(() => {
    const set = new Set<string>();
    for (const n of data ?? []) {
      if (!n.isRead && (n.type === "mention" || n.type === "broadcast_mention")) {
        set.add(n.channelIdentifier);
      }
    }
    return set;
  }, [data]);
}

export function useNotificationUnreadCounts() {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.notificationUnreadCounts(),
    queryFn: fetchUnreadCounts,
    staleTime: Infinity,
    meta: { noGlobalRedirect: true },
    enabled: hasToken,
  });
}

export function useMarkAllNotificationsRead(
  communityIdentifier: string,
  communityNumericId: number | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(communityIdentifier),
    onSuccess: () => {
      queryClient.setQueryData(
        queryKeys.notifications(communityIdentifier),
        (old: AppNotification[] | undefined) => old?.map((n) => ({ ...n, isRead: true })) ?? [],
      );
      if (communityNumericId !== undefined) {
        queryClient.setQueryData(queryKeys.notificationUnreadCounts(), (old: UnreadCounts) => ({
          counts: { ...old?.counts, [String(communityNumericId)]: 0 },
        }));
      }
    },
  });
}

export function useMarkNotificationRead(
  communityIdentifier: string,
  communityNumericId: number | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onMutate: async (id) => {
      const previousList = queryClient.getQueryData<AppNotification[]>(
        queryKeys.notifications(communityIdentifier),
      );
      const previousCounts = queryClient.getQueryData<UnreadCounts>(
        queryKeys.notificationUnreadCounts(),
      );
      queryClient.setQueryData(
        queryKeys.notifications(communityIdentifier),
        (old: AppNotification[] | undefined) =>
          old?.map((n) => (n.id === id ? { ...n, isRead: true } : n)) ?? [],
      );
      if (communityNumericId !== undefined) {
        queryClient.setQueryData(queryKeys.notificationUnreadCounts(), (old: UnreadCounts) => ({
          counts: {
            ...old?.counts,
            [String(communityNumericId)]: Math.max(
              0,
              (old?.counts?.[String(communityNumericId)] ?? 1) - 1,
            ),
          },
        }));
      }
      return { previousList, previousCounts };
    },
    onError: (_err, _id, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(
          queryKeys.notifications(communityIdentifier),
          context.previousList,
        );
      }
      if (context?.previousCounts) {
        queryClient.setQueryData(queryKeys.notificationUnreadCounts(), context.previousCounts);
      }
    },
  });
}
