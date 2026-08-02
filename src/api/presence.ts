import { apiClient, getBaseUrl, versionedPath } from "@/api/client";
import { getAccessToken } from "@/api/tokenStore";
import type { ManualPresenceStatus, PresenceBatchResponse, PresenceState } from "@/types/api";

export async function fetchPresence(userIds: readonly number[]): Promise<PresenceBatchResponse> {
  if (userIds.length === 0) return { presences: [] };
  const query = userIds.map((id) => `userIds[]=${id}`).join("&");
  return apiClient.getJson<PresenceBatchResponse>(`/api/presence?${query}`);
}

export interface CommunityPresenceSummary {
  onlineCount: number;
  guestsOnline: number;
}

export interface PresenceHistoryPoint {
  sampledAt: string;
  membersOnline: number;
  guestsOnline: number;
}

export interface CommunityOnlineUser {
  userId: number;
  state: Exclude<PresenceState, "offline">;
}

export interface CommunityOnlineResponse {
  users: CommunityOnlineUser[];
}

export const fetchCommunityPresenceSummary = (identifier: string) =>
  apiClient.getJson<CommunityPresenceSummary>(
    `/api/communities/${encodeURIComponent(identifier)}/presence/summary`,
  );

export const fetchPresenceHistory = (identifier: string, days: number) =>
  apiClient.getJson<{ samples: PresenceHistoryPoint[] }>(
    `/api/communities/${encodeURIComponent(identifier)}/presence/history?days=${days}`,
  );

export const fetchCommunityOnlineUsers = (identifier: string) =>
  apiClient.getJson<CommunityOnlineResponse>(
    `/api/communities/${encodeURIComponent(identifier)}/presence/online`,
  );

export async function setManualPresence(
  status: ManualPresenceStatus | null,
): Promise<{ state: PresenceState }> {
  return apiClient.postJson<{ state: PresenceState }>("/api/me/presence", { status });
}

export function sendOfflineBeacon(): void {
  const token = getAccessToken();
  if (!token) return;

  try {
    void fetch(`${getBaseUrl()}${versionedPath("/api/me/presence/offline")}`, {
      method: "POST",
      keepalive: true,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* ignore */
  }
}
