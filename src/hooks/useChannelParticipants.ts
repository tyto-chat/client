import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchChannelParticipants } from "@/api/channels";
import { queryKeys } from "@/queries/queryKeys";
import { useMercureSubscription } from "@/hooks/useMercureSubscription";
import { parseMercureEvent } from "@/utils/parseMercureEvent";
import type { ChannelParticipant, ChannelParticipantsMercureEvent } from "@/types/api";
import { StaleTime } from "@/queries/staleTimes";
import { useHasAccessToken } from "@/api/tokenStore";

const PARTICIPANTS_STALE_TIME = StaleTime.static;

export function useChannelParticipantsQuery(
  communityId: string,
  channelId: string,
  enabled = true,
) {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.channelParticipants(communityId, channelId),
    queryFn: () => fetchChannelParticipants(communityId, channelId),
    staleTime: PARTICIPANTS_STALE_TIME,
    enabled: hasToken && enabled,
  });
}

export function useChannelParticipants(communityId: string, channelId: string, enabled = true) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("channel");
  const hasToken = useHasAccessToken();
  const topic = `/api/communities/${communityId}/channels/${channelId}/participants`;
  const lastGeneratedAt = useRef(0);

  const query = useQuery({
    queryKey: queryKeys.channelParticipants(communityId, channelId),
    queryFn: () => fetchChannelParticipants(communityId, channelId),
    staleTime: PARTICIPANTS_STALE_TIME,
    enabled: hasToken && enabled,
  });

  useMercureSubscription(
    enabled ? topic : null,
    (event) => {
      const data = parseMercureEvent<ChannelParticipantsMercureEvent>(event);
      if (!data || data.type !== "channel.participants") return;

      // Mercure does not guarantee order; a stale full snapshot would drop users.
      const generatedAt = data.generatedAt ?? 0;
      if (generatedAt < lastGeneratedAt.current) return;
      lastGeneratedAt.current = generatedAt;

      queryClient.setQueryData<ChannelParticipant[]>(
        queryKeys.channelParticipants(communityId, channelId),
        (prev) => {
          const prevByUserId = new Map((prev ?? []).map((p) => [p.userId, p]));
          return data.participants.map((p) => {
            const existing = prevByUserId.get(p.userId);
            return {
              "@id": existing?.["@id"] ?? `/api/users/${p.userId}`,
              "@type": "ChannelParticipant",
              id: p.userId,
              userId: p.userId,
              profile: existing?.profile ?? {
                "@id": `/api/profiles/${p.userId}`,
                "@type": "UserProfile",
                name: p.name,
                avatar: p.avatarUrl
                  ? {
                      "@id": "",
                      "@type": "MediaObject",
                      contentUrl: { sm: p.avatarUrl, md: p.avatarUrl, lg: p.avatarUrl },
                    }
                  : null,
              },
              joinedAt: p.joinedAt,
            };
          });
        },
      );
    },
    t("voice_realtime_error"),
  );

  return query;
}
