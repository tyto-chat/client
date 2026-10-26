import { apiClient } from "@/api/client";
import type { BlockedUser, BlockStatus } from "@/types/api";

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const data = await apiClient.getJson<{ items: BlockedUser[] }>("/api/me/blocks");
  return data.items;
}

export function fetchBlockStatus(userId: number): Promise<BlockStatus> {
  return apiClient.getJson<BlockStatus>(`/api/me/blocks/${userId}`);
}

export function blockUser(userId: number): Promise<BlockedUser> {
  return apiClient.postJson<BlockedUser>("/api/me/blocks", { userId });
}

export function unblockUser(userId: number): Promise<void> {
  return apiClient.delete<void>(`/api/me/blocks/${userId}`);
}
