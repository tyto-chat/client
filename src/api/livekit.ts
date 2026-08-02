import { apiClient, getBaseUrl, versionedPath } from "@/api/client";
import { getAccessToken } from "@/api/tokenStore";

export interface LiveKitTokenResponse {
  token: string;
  url: string;
}

export function fetchLiveKitToken(
  communityId: string,
  channelId: string,
): Promise<LiveKitTokenResponse> {
  return apiClient.post<LiveKitTokenResponse>(
    `/api/communities/${communityId}/channels/${channelId}/call/token`,
    {},
  );
}

export function leaveChannel(communityId: string, channelId: string): Promise<void> {
  return apiClient.delete<void>(`/api/communities/${communityId}/channels/${channelId}/call`);
}

// A normal fetch is cancelled during unload; keepalive is required here.
export function sendLeaveChannelBeacon(communityId: string, channelId: string): void {
  const token = getAccessToken();
  if (!token) return;

  try {
    void fetch(
      `${getBaseUrl()}${versionedPath(`/api/communities/${communityId}/channels/${channelId}/call`)}`,
      {
        method: "DELETE",
        keepalive: true,
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  } catch {
    /* ignore */
  }
}
