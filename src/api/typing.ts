import { apiClient } from "@/api/client";

export function sendChannelTyping(communityIdentifier: string, channelIdentifier: string): void {
  void apiClient
    .postJson(
      `/api/communities/${encodeURIComponent(communityIdentifier)}/channels/${encodeURIComponent(
        channelIdentifier,
      )}/typing`,
      {},
    )
    .catch(() => {});
}

export function sendConversationTyping(conversationIdentifier: string): void {
  void apiClient
    .postJson(`/api/conversations/${encodeURIComponent(conversationIdentifier)}/typing`, {})
    .catch(() => {});
}
