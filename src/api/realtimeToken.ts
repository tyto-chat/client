import { apiClient } from "@/api/client";

export interface RealtimeTokenResponse {
  token: string;
  expiresAt: number;
}

export interface PublicRealtimeTokenResponse {
  token: string | null;
  expiresAt: number | null;
}

export async function fetchRealtimeToken(): Promise<RealtimeTokenResponse> {
  return apiClient.get<RealtimeTokenResponse>("/api/realtime/token");
}

export async function fetchPublicRealtimeToken(): Promise<PublicRealtimeTokenResponse> {
  return apiClient.get<PublicRealtimeTokenResponse>("/api/realtime/public-token");
}
