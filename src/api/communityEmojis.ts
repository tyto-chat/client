import { apiClient, uploadFile } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type { CommunityEmoji, HydraCollection } from "@/types/api";

export async function fetchCommunityEmojis(communityIdentifier: string): Promise<CommunityEmoji[]> {
  const data = await apiClient.get<HydraCollection<CommunityEmoji>>(
    `/api/communities/${communityIdentifier}/emojis`,
  );
  return unwrapCollection(data);
}

export function uploadCustomEmoji(
  communityIdentifier: string,
  file: File,
  shortcode: string,
  name: string | null,
  onProgress?: (percent: number) => void,
): Promise<CommunityEmoji> {
  const fields: Record<string, string> = { shortcode };
  if (name !== null && name.trim() !== "") fields.name = name.trim();
  return uploadFile<CommunityEmoji>(
    `/api/communities/${communityIdentifier}/emojis/custom`,
    file,
    onProgress,
    fields,
  );
}

export function deleteCommunityEmoji(emojiId: number): Promise<void> {
  return apiClient.delete<void>(`/api/community_emojis/${emojiId}`);
}
