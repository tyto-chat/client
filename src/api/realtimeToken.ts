import { apiClient } from "@/api/client";

export interface RealtimeTokenResponse {
  token: string;
  expiresAt: number;
}

export interface PublicRealtimeTokenResponse {
  token: string | null;
  expiresAt: number | null;
}

export interface RealtimeScope {
  community?: string;
  conversation?: string;
}

function withScope(path: string, scope: RealtimeScope): string {
  const params = new URLSearchParams();
  if (scope.community) params.set("community", scope.community);
  if (scope.conversation) params.set("conversation", scope.conversation);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export async function fetchRealtimeToken(
  scope: RealtimeScope = {},
): Promise<RealtimeTokenResponse> {
  return apiClient.get<RealtimeTokenResponse>(withScope("/api/realtime/token", scope));
}

export async function fetchPublicRealtimeToken(
  scope: RealtimeScope = {},
): Promise<PublicRealtimeTokenResponse> {
  return apiClient.get<PublicRealtimeTokenResponse>(
    withScope("/api/realtime/public-token", { community: scope.community }),
  );
}
