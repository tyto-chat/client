import type { MyCommunityMembership } from "@/types/api";

export function communityMemberIdSet(
  memberships: MyCommunityMembership[] | undefined,
): Set<number> {
  return new Set((memberships ?? []).map((m) => m.communityId));
}

export function isCommunityMember(
  communityId: number,
  memberIds: Set<number>,
  isGlobalAdmin: boolean,
): boolean {
  return isGlobalAdmin || memberIds.has(communityId);
}
