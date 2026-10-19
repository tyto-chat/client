import type { LinkedPlaces } from "@/queries/linkedMessageQueries";
import type { Message } from "@/types/api";
import type { LinkScope } from "@/utils/linkScope";

interface HeaderInput {
  scope: LinkScope;
  hostCommunityId: string | undefined;
  message: Message;
  places: LinkedPlaces;
}

export function linkedHeaderParts({
  scope,
  hostCommunityId,
  message,
  places,
}: HeaderInput): string[] {
  if (!message.channelIdentifier || !message.communityIdentifier) return [];
  const channel = places.channel ? `#${places.channel}` : null;
  const sameCommunity = scope.kind === "current" && message.communityIdentifier === hostCommunityId;
  const parts =
    scope.kind === "foreign"
      ? [channel, places.community, places.server]
      : sameCommunity
        ? [channel]
        : [channel, places.community];
  return parts.filter((part): part is string => !!part);
}
