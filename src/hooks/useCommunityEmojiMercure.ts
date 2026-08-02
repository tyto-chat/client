import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { queryKeys } from "@/queries/queryKeys";
import { useMercureSubscription } from "@/hooks/useMercureSubscription";
import { parseMercureEvent } from "@/utils/parseMercureEvent";

interface CommunityEmojisUpdatedEvent {
  type: "community.emojis.updated";
  communityIdentifier: string;
}

export function useCommunityEmojiMercure(communityIdentifier: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("community");
  const topic = communityIdentifier ? `/api/communities/${communityIdentifier}/emojis` : null;

  useMercureSubscription(
    topic,
    (event) => {
      const data = parseMercureEvent<CommunityEmojisUpdatedEvent>(event);
      if (!data || data.type !== "community.emojis.updated") return;
      void queryClient.invalidateQueries({
        queryKey: queryKeys.communityEmojis(communityIdentifier),
      });
    },
    t("emoji_realtime_error"),
  );
}
