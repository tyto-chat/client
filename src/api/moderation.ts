import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type { HydraCollection, ModerationAction, ModeratorNote } from "@/types/api";

export function fetchModerationLog(
  communityId: string,
  page = 1,
  type?: "warn" | "timeout" | "ban" | "server_ban",
  activeOnly?: boolean,
  targetUserId?: number,
): Promise<HydraCollection<ModerationAction>> {
  const params = new URLSearchParams({ page: String(page) });
  if (type) params.set("type", type);
  if (activeOnly) params.set("active", "1");
  if (targetUserId != null) params.set("targetUserId", String(targetUserId));
  return apiClient.get<HydraCollection<ModerationAction>>(
    `/api/communities/${communityId}/moderation?${params.toString()}`,
  );
}

export async function fetchActiveModeration(
  communityId: string,
  userId: number,
): Promise<ModerationAction[]> {
  const data = await apiClient.get<HydraCollection<ModerationAction>>(
    `/api/communities/${communityId}/users/${userId}/active-moderation`,
  );
  return unwrapCollection(data);
}

export function createModerationAction(
  communityId: string,
  data: {
    targetUserId: number;
    type: "warn" | "timeout" | "ban" | "server_ban";
    reason?: string;
    expiresAt?: string | null;
    channelIdentifier?: string | null;
  },
): Promise<ModerationAction> {
  return apiClient.post<ModerationAction>(`/api/communities/${communityId}/moderation`, data);
}

export function liftModerationAction(communityId: string, actionId: number): Promise<void> {
  return apiClient.delete(`/api/communities/${communityId}/moderation/${actionId}`);
}

export async function fetchModeratorNotes(
  communityId: string,
  userId: number,
): Promise<ModeratorNote[]> {
  const data = await apiClient.get<HydraCollection<ModeratorNote>>(
    `/api/communities/${communityId}/users/${userId}/notes`,
  );
  return unwrapCollection(data);
}

export function createModeratorNote(
  communityId: string,
  userId: number,
  content: string,
): Promise<ModeratorNote> {
  return apiClient.post<ModeratorNote>(`/api/communities/${communityId}/users/${userId}/notes`, {
    content,
  });
}

export function updateModeratorNote(
  communityId: string,
  noteId: number,
  content: string,
): Promise<ModeratorNote> {
  return apiClient.patch<ModeratorNote>(`/api/communities/${communityId}/notes/${noteId}`, {
    content,
  });
}

export function deleteModeratorNote(communityId: string, noteId: number): Promise<void> {
  return apiClient.delete(`/api/communities/${communityId}/notes/${noteId}`);
}
