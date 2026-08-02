import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markAllDmsRead, markCommunityAllRead, markEverythingRead } from "@/api/markAllRead";
import { queryKeys } from "@/queries/queryKeys";

export function useMarkCommunityAllRead(communityIdentifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markCommunityAllRead(communityIdentifier),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.channelUnread(communityIdentifier),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notifications(communityIdentifier),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCounts() });
    },
  });
}

export function useMarkAllDmsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllDmsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dmNotifications() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCounts() });
    },
  });
}

export function useMarkEverythingRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markEverythingRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channelUnread"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dmNotifications() });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCounts() });
    },
  });
}
