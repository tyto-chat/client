import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteCommunityEmoji,
  fetchCommunityEmojis,
  uploadCustomEmoji,
} from "@/api/communityEmojis";
import { queryKeys } from "@/queries/queryKeys";
import type { CommunityEmoji } from "@/types/api";
import { forgetEmojiKeys } from "@/utils/emojiUsage";
import { StaleTime } from "./staleTimes";

export function useCommunityEmojis(communityIdentifier: string | undefined) {
  return useQuery({
    queryKey: communityIdentifier
      ? queryKeys.communityEmojis(communityIdentifier)
      : ["communityEmojis", "disabled"],
    queryFn: () => fetchCommunityEmojis(communityIdentifier as string),
    enabled: Boolean(communityIdentifier),
    staleTime: StaleTime.long,
  });
}

export function useUploadCustomEmoji(communityIdentifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      shortcode,
      name,
    }: {
      file: File;
      shortcode: string;
      name: string | null;
    }) => uploadCustomEmoji(communityIdentifier, file, shortcode, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.communityEmojis(communityIdentifier),
      });
    },
  });
}

export function useDeleteCommunityEmoji(communityIdentifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emojiId: number) => deleteCommunityEmoji(emojiId),
    onSuccess: (_void, emojiId) => {
      const prevList = queryClient.getQueryData<CommunityEmoji[]>(
        queryKeys.communityEmojis(communityIdentifier),
      );
      const removed = prevList?.find((e) => e.id === emojiId);
      queryClient.setQueryData<CommunityEmoji[]>(
        queryKeys.communityEmojis(communityIdentifier),
        (prev) => prev?.filter((e) => e.id !== emojiId),
      );
      if (removed) {
        forgetEmojiKeys(communityIdentifier, [removed.shortcode]);
      }
    },
  });
}
