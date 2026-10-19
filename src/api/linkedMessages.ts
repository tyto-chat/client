import { unwrapCollection } from "@/api/hydra";
import { fetchChannel } from "@/api/channels";
import { fetchCommunity } from "@/api/communities";
import { fetchCommunityEmojis } from "@/api/communityEmojis";
import { fetchMessage } from "@/api/messages";
import { identityFetch } from "@/desktop/connections/identityFetch";
import type { Channel, Community, CommunityEmoji, HydraCollection, Message } from "@/types/api";
import type { LinkScope } from "@/utils/linkScope";

export function fetchMessageIn(scope: LinkScope, uuid: string): Promise<Message> {
  return scope.kind === "foreign"
    ? identityFetch<Message>(scope.endpoint.ctx, `/messages/${uuid}`)
    : fetchMessage(uuid);
}

export function fetchChannelIn(
  scope: LinkScope,
  communityId: string,
  channelId: string,
): Promise<Channel> {
  return scope.kind === "foreign"
    ? identityFetch<Channel>(
        scope.endpoint.ctx,
        `/communities/${communityId}/channels/${channelId}`,
      )
    : fetchChannel(communityId, channelId);
}

export function fetchCommunityIn(scope: LinkScope, identifier: string): Promise<Community> {
  return scope.kind === "foreign"
    ? identityFetch<Community>(scope.endpoint.ctx, `/communities/${identifier}`)
    : fetchCommunity(identifier);
}

export async function fetchEmojisIn(
  scope: LinkScope,
  communityId: string,
): Promise<CommunityEmoji[]> {
  if (scope.kind !== "foreign") return fetchCommunityEmojis(communityId);
  const data = await identityFetch<HydraCollection<CommunityEmoji>>(
    scope.endpoint.ctx,
    `/communities/${communityId}/emojis`,
  );
  return unwrapCollection(data);
}
