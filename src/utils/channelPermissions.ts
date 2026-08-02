import type { Channel, Community, CommunityMembership, User } from "@/types/api";

export interface ChannelPermissions {
  isGlobalAdmin: boolean;
  isCommunityAdmin: boolean;
  isAdmin: boolean;
  isMember: boolean;
  hasJoined: boolean;
  isChannelModerator: boolean;
  isCommunityModerator: boolean;
  canViewMembers: boolean;
  canPin: boolean;
  canModerate: boolean;
  canManageChannelMembers: boolean;
  canBroadcast: boolean;
}

const roleRank = (r: string): number => (r === "admin" ? 2 : r === "moderator" ? 1 : 0);

export function getChannelPermissions(
  community: Community | undefined,
  currentChannel: Channel | undefined,
  user: User | null,
  membership?: CommunityMembership,
): ChannelPermissions {
  const isGlobalAdmin = user?.roles?.includes("ROLE_ADMIN") ?? false;
  const isCommunityAdmin = isGlobalAdmin || membership?.role === "admin";
  const isMember = isGlobalAdmin || (membership?.hasMembership ?? false);
  const channelRole = currentChannel ? membership?.channelRoles[currentChannel.id] : undefined;
  const isChannelModerator = channelRole === "moderator";
  const isCommunityModerator = membership?.role === "moderator";
  const canPin = isCommunityAdmin || isChannelModerator || isCommunityModerator;

  const callerBroadcastRank = isCommunityAdmin
    ? 2
    : isChannelModerator || isCommunityModerator
      ? 1
      : isMember
        ? 0
        : -1;

  return {
    isGlobalAdmin,
    isCommunityAdmin,
    isAdmin: isCommunityAdmin,
    isMember,
    hasJoined: membership?.hasMembership ?? false,
    isChannelModerator,
    isCommunityModerator,
    canViewMembers: isCommunityAdmin || channelRole != null,
    canPin,
    canModerate: canPin,
    canManageChannelMembers: canPin,
    canBroadcast: callerBroadcastRank >= roleRank(community?.broadcastMentionMinRole ?? "member"),
  };
}
