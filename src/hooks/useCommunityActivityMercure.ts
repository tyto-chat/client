import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { queryKeys } from "@/queries/queryKeys";
import { useMercureSubscription } from "@/hooks/useMercureSubscription";
import { parseMercureEvent } from "@/utils/parseMercureEvent";
import type { ChannelActivityMercureEvent, Community } from "@/types/api";

export function useCommunityActivityMercure(communityIdentifier: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("channel");
  const topic = communityIdentifier ? `/api/communities/${communityIdentifier}/activity` : null;

  useMercureSubscription(
    topic,
    (event) => {
      const data = parseMercureEvent<ChannelActivityMercureEvent>(event);
      if (!data || data.type !== "channel.activity") return;
      queryClient.setQueryData<Community>(queryKeys.community(communityIdentifier), (old) => {
        if (!old) return old;
        return {
          ...old,
          channels: old.channels.map((ch) =>
            ch.identifier === data.channelIdentifier
              ? { ...ch, lastMessageAt: data.lastMessageAt }
              : ch,
          ),
        };
      });
      queryClient.setQueryData<string[]>(queryKeys.channelUnread(communityIdentifier), (old) =>
        old?.includes(data.channelIdentifier) ? old : [...(old ?? []), data.channelIdentifier],
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.channelUnread(communityIdentifier),
      });
    },
    t("activity_realtime_error"),
  );
}
