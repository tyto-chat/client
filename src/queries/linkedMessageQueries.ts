import { useQuery } from "@tanstack/react-query";
import {
  fetchChannelIn,
  fetchCommunityIn,
  fetchEmojisIn,
  fetchMessageIn,
} from "@/api/linkedMessages";
import { useServerDirectory } from "@/platform/serverDirectory";
import { queryKeys } from "@/queries/queryKeys";
import { StaleTime } from "@/queries/staleTimes";
import type { CommunityEmoji, Message } from "@/types/api";
import { linkScope, type LinkScope, type PermalinkTarget } from "@/utils/linkScope";
import { hostFromOrigin } from "@/utils/serverDisplay";

export function useLinkScope(origin: string): LinkScope | null {
  useServerDirectory();
  return linkScope(origin);
}

export function useLinkedMessage(target: PermalinkTarget) {
  const scope = useLinkScope(target.origin);
  return useQuery({
    queryKey:
      scope?.kind === "foreign"
        ? queryKeys.foreignMessage(target.origin, target.uuid)
        : queryKeys.message(target.uuid),
    queryFn: () => fetchMessageIn(scope!, target.uuid),
    enabled: scope !== null,
    staleTime: StaleTime.long,
    retry: false,
    meta: { noGlobalRedirect: true },
  });
}

export interface LinkedPlaces {
  channel: string | null;
  community: string | null;
  server: string | null;
}

export function useLinkedPlaces(
  target: PermalinkTarget,
  message: Message | undefined,
): LinkedPlaces {
  const scope = useLinkScope(target.origin);
  const communityId = message?.communityIdentifier ?? undefined;
  const channelId = message?.channelIdentifier ?? undefined;
  const snapshotCommunity =
    scope?.kind === "foreign"
      ? scope.endpoint.communities.find((c) => c.identifier === communityId)
      : undefined;

  const channel = useQuery({
    queryKey: queryKeys.linkedChannel(target.origin, communityId ?? "", channelId ?? ""),
    queryFn: () => fetchChannelIn(scope!, communityId!, channelId!),
    enabled: scope !== null && !!communityId && !!channelId,
    staleTime: StaleTime.long,
    retry: false,
    meta: { noGlobalRedirect: true },
  });
  const community = useQuery({
    queryKey: queryKeys.linkedCommunity(target.origin, communityId ?? ""),
    queryFn: () => fetchCommunityIn(scope!, communityId!),
    enabled: scope !== null && !!communityId && !snapshotCommunity,
    staleTime: StaleTime.long,
    retry: false,
    meta: { noGlobalRedirect: true },
  });

  return {
    channel: channel.data?.name ?? channelId ?? null,
    community: snapshotCommunity?.name ?? community.data?.name ?? communityId ?? null,
    server:
      scope?.kind === "foreign"
        ? (scope.endpoint.serverName ?? hostFromOrigin(scope.endpoint.origin))
        : null,
  };
}

export function useLinkedEmojis(
  target: PermalinkTarget,
  communityIdentifier: string | undefined,
): CommunityEmoji[] | undefined {
  const scope = useLinkScope(target.origin);
  const { data } = useQuery({
    queryKey:
      scope?.kind === "foreign"
        ? queryKeys.foreignEmojis(target.origin, communityIdentifier ?? "")
        : queryKeys.communityEmojis(communityIdentifier ?? ""),
    queryFn: () => fetchEmojisIn(scope!, communityIdentifier!),
    enabled: scope !== null && !!communityIdentifier,
    staleTime: StaleTime.long,
    retry: false,
  });
  return data;
}
