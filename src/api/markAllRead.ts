import { apiClient } from "@/api/client";

export const markCommunityAllRead = (communityIdentifier: string) =>
  apiClient.post<void>(`/api/communities/${communityIdentifier}/mark-all-read`, {});

export const markAllDmsRead = () => apiClient.post<void>("/api/me/conversations/mark-all-read", {});

export const markEverythingRead = () => apiClient.post<void>("/api/me/mark-all-read", {});
