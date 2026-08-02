import { avatarUrl } from "@/api/client";
import type { MemberItem } from "@/utils/userMentionExtension";

interface ProfileMember {
  userId: number;
  profile?: {
    name: string;
    "@id"?: string;
    avatar?: { contentUrl?: Parameters<typeof avatarUrl>[0] } | null;
  } | null;
}

export function toMemberItems(
  members: ProfileMember[] | undefined,
  currentUserId: number | undefined,
): MemberItem[] {
  return (members ?? [])
    .filter((m) => m.userId !== currentUserId && m.profile)
    .map((m) => ({
      id: m.userId,
      name: m.profile!.name,
      avatarUrl: avatarUrl(m.profile!.avatar?.contentUrl ?? null),
      colorKey: m.profile!["@id"] ?? `user:${m.userId}`,
    }));
}
