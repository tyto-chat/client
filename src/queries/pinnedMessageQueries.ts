import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { fetchChannelPinnedMessages } from "@/api/pinnedMessages";
import { pinMessage, unpinMessage } from "@/api/messages";
import { patchMessageInPages } from "@/queries/messageQueries";
import { queryKeys } from "@/queries/queryKeys";
import { uuidFromIri } from "@/api/hydra";
import { useHasAccessToken } from "@/api/tokenStore";
import type { ChannelPage, Message } from "@/types/api";

export function useChannelPinnedMessages(
  communityId: string,
  channelIdentifier: string,
  enabled = true,
) {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.pinnedMessages(communityId, channelIdentifier),
    queryFn: () => fetchChannelPinnedMessages(communityId, channelIdentifier),
    enabled: hasToken && enabled && !!communityId && !!channelIdentifier,
    staleTime: StaleTime.medium,
  });
}

export function usePinMessage(communityId: string, channelIdentifier: string) {
  const queryClient = useQueryClient();
  const pagesKey = queryKeys.channelPages(communityId, channelIdentifier);
  const pinnedKey = queryKeys.pinnedMessages(communityId, channelIdentifier);

  return useMutation({
    mutationFn: (messageIri: string) => pinMessage(uuidFromIri(messageIri)),
    onMutate: (messageIri) => {
      const previous = queryClient.getQueryData<InfiniteData<ChannelPage>>(pagesKey);
      queryClient.setQueryData<InfiniteData<ChannelPage>>(pagesKey, (old) =>
        patchMessageInPages(old, messageIri, { pinned: true, pinnedAt: new Date().toISOString() }),
      );
      return { previous };
    },
    onError: (_err, _messageIri, context) => {
      if (context?.previous) queryClient.setQueryData(pagesKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pinnedKey });
    },
  });
}

export function useUnpinMessage(communityId: string, channelIdentifier: string) {
  const queryClient = useQueryClient();
  const pagesKey = queryKeys.channelPages(communityId, channelIdentifier);
  const pinnedKey = queryKeys.pinnedMessages(communityId, channelIdentifier);

  return useMutation({
    mutationFn: (messageIri: string) => unpinMessage(uuidFromIri(messageIri)),
    onMutate: (messageIri) => {
      const previousPages = queryClient.getQueryData<InfiniteData<ChannelPage>>(pagesKey);
      const previousPinned = queryClient.getQueryData<Message[]>(pinnedKey);

      queryClient.setQueryData<InfiniteData<ChannelPage>>(pagesKey, (old) =>
        patchMessageInPages(old, messageIri, { pinned: false, pinnedAt: null }),
      );
      queryClient.setQueryData<Message[]>(pinnedKey, (old) =>
        old?.filter((m) => m["@id"] !== messageIri),
      );

      return { previousPages, previousPinned };
    },
    onError: (_err, _messageIri, context) => {
      if (context?.previousPages) queryClient.setQueryData(pagesKey, context.previousPages);
      if (context?.previousPinned) queryClient.setQueryData(pinnedKey, context.previousPinned);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pinnedKey });
    },
  });
}
