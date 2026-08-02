import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type { HydraCollection, Message } from "@/types/api";

export async function fetchChannelPinnedMessages(
  communityId: string,
  channelIdentifier: string,
): Promise<Message[]> {
  const data = await apiClient.get<HydraCollection<Message> | Message[]>(
    `/api/communities/${communityId}/channels/${channelIdentifier}/pinned-messages`,
  );
  return unwrapCollection(data);
}
