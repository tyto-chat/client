import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type { ChannelPage, HydraCollection } from "@/types/api";

export async function fetchChannelPages(
  communityId: string,
  channelIdentifier: string,
): Promise<ChannelPage[]> {
  const data = await apiClient.get<HydraCollection<ChannelPage>>(
    `/api/communities/${communityId}/channels/${channelIdentifier}/pages`,
  );
  return unwrapCollection(data);
}

export function fetchChannelPage(
  communityId: string,
  channelIdentifier: string,
  pageNumber: number,
): Promise<ChannelPage> {
  return apiClient.get<ChannelPage>(
    `/api/communities/${communityId}/channels/${channelIdentifier}/pages/${pageNumber}`,
  );
}

export async function fetchConversationPages(
  conversationIdentifier: string,
): Promise<ChannelPage[]> {
  const data = await apiClient.get<HydraCollection<ChannelPage>>(
    `/api/conversations/${conversationIdentifier}/pages`,
  );
  return unwrapCollection(data);
}

export function fetchConversationPage(
  conversationIdentifier: string,
  pageNumber: number,
): Promise<ChannelPage> {
  return apiClient.get<ChannelPage>(
    `/api/conversations/${conversationIdentifier}/pages/${pageNumber}`,
  );
}
