import { apiClient } from "@/api/client";
import { unwrapCollection, uuidFromIri } from "@/api/hydra";
import type { HydraCollection, ReactionUser } from "@/types/api";

export async function addReaction(messageIri: string, emoji: string): Promise<{ id: number }> {
  const created = await apiClient.post<{ "@id"?: string; id?: number }>(`${messageIri}/reactions`, {
    emoji,
  });
  const fromIri = Number(created["@id"]?.split("/").pop());
  return { id: created.id ?? (Number.isFinite(fromIri) ? fromIri : 0) };
}

export function removeReaction(reactionId: number): Promise<void> {
  return apiClient.delete<void>(`/api/reactions/${reactionId}`);
}

export async function fetchReactionUsers(
  messageIri: string,
  emoji: string,
): Promise<ReactionUser[]> {
  const id = uuidFromIri(messageIri);
  const data = await apiClient.get<HydraCollection<ReactionUser>>(
    `/api/messages/${id}/reactions/${encodeURIComponent(emoji)}`,
  );
  return unwrapCollection(data);
}
