import { avatarUrl } from "@/api/client";
import type { AvatarMediaObject } from "@/types/api";
import type { PickerItem } from "@/components/UserPicker";

export interface PickerMember {
  userId: number;
  profile: { name: string; avatar: AvatarMediaObject | null };
}

export function buildPickerCandidates(
  pool: readonly PickerMember[],
  {
    query,
    excludeIds,
    limit = 8,
  }: { query: string; excludeIds?: Iterable<number>; limit?: number },
): PickerItem[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const exclude = new Set(excludeIds ?? []);
  return pool
    .filter((m) => !exclude.has(m.userId) && m.profile.name.toLowerCase().includes(q))
    .slice(0, limit)
    .map((m) => ({
      id: m.userId,
      name: m.profile.name,
      avatarUrl: avatarUrl(m.profile.avatar?.contentUrl ?? null),
    }));
}
