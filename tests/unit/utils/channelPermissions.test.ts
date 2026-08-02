import { describe, it, expect } from "vitest";
import { getChannelPermissions } from "@/utils/channelPermissions";
import type { Channel, Community, CommunityMembership, User } from "@/types/api";

const community = (over: Partial<Community> = {}): Community =>
  ({
    broadcastMentionMinRole: "member",
    ...over,
  }) as Community;

const channel = (over: Partial<Channel> = {}): Channel => ({ id: 1, ...over }) as Channel;

const user = (roles: string[] = []): User => ({ roles }) as User;

const membership = (over: Partial<CommunityMembership> = {}): CommunityMembership => ({
  role: null,
  hasMembership: false,
  channelRoles: {},
  ...over,
});

describe("getChannelPermissions", () => {
  it("grants everything to a global admin", () => {
    const p = getChannelPermissions(community(), channel(), user(["ROLE_ADMIN"]));
    expect(p.isGlobalAdmin).toBe(true);
    expect(p.isAdmin).toBe(true);
    expect(p.isMember).toBe(true);
    expect(p.canPin).toBe(true);
    expect(p.canModerate).toBe(true);
    expect(p.canManageChannelMembers).toBe(true);
    expect(p.canBroadcast).toBe(true);
  });

  it("global admin without a membership row still bypasses membership, but hasJoined stays false", () => {
    const p = getChannelPermissions(
      community(),
      channel(),
      user(["ROLE_ADMIN"]),
      membership({ hasMembership: false }),
    );
    expect(p.isMember).toBe(true);
    expect(p.hasJoined).toBe(false);
  });

  it("treats community-admin role (from membership) as admin", () => {
    const p = getChannelPermissions(
      community(),
      channel(),
      user(),
      membership({ role: "admin", hasMembership: true }),
    );
    expect(p.isAdmin).toBe(true);
    expect(p.canPin).toBe(true);
    expect(p.hasJoined).toBe(true);
  });

  it("gives a channel moderator (from channelRoles) pin/moderate/manage but not admin", () => {
    const p = getChannelPermissions(
      community(),
      channel({ id: 7 }),
      user(),
      membership({ hasMembership: true, channelRoles: { 7: "moderator" } }),
    );
    expect(p.isAdmin).toBe(false);
    expect(p.isChannelModerator).toBe(true);
    expect(p.canPin).toBe(true);
    expect(p.canManageChannelMembers).toBe(true);
    expect(p.canViewMembers).toBe(true);
  });

  it("does not treat a moderator role on a different channel as a match", () => {
    const p = getChannelPermissions(
      community(),
      channel({ id: 7 }),
      user(),
      membership({ hasMembership: true, channelRoles: { 9: "moderator" } }),
    );
    expect(p.isChannelModerator).toBe(false);
    expect(p.canViewMembers).toBe(false);
  });

  it("plain member: no mod powers, can broadcast when min role is member", () => {
    const p = getChannelPermissions(
      community({ broadcastMentionMinRole: "member" }),
      channel(),
      user(),
      membership({ hasMembership: true }),
    );
    expect(p.isMember).toBe(true);
    expect(p.canPin).toBe(false);
    expect(p.canManageChannelMembers).toBe(false);
    expect(p.canBroadcast).toBe(true);
  });

  it("blocks broadcast when the member's rank is below the community minimum", () => {
    const p = getChannelPermissions(
      community({ broadcastMentionMinRole: "moderator" }),
      channel(),
      user(),
      membership({ hasMembership: true }),
    );
    expect(p.canBroadcast).toBe(false);
  });

  it("non-member anonymous: no permissions, no broadcast", () => {
    const p = getChannelPermissions(community(), channel(), null);
    expect(p.isMember).toBe(false);
    expect(p.hasJoined).toBe(false);
    expect(p.canViewMembers).toBe(false);
    expect(p.canBroadcast).toBe(false);
  });

  it("logged-in non-admin with membership omitted (loading/not-yet-fetched): fails safe, no crash", () => {
    // The chokepoint always passes a 4th arg now, but the query can still
    // resolve `undefined` while in flight — this must not throw and must not
    // grant any membership-gated permission.
    const p = getChannelPermissions(community(), channel(), user());
    expect(p.isGlobalAdmin).toBe(false);
    expect(p.isAdmin).toBe(false);
    expect(p.isMember).toBe(false);
    expect(p.hasJoined).toBe(false);
    expect(p.isChannelModerator).toBe(false);
    expect(p.isCommunityModerator).toBe(false);
    expect(p.canViewMembers).toBe(false);
    expect(p.canPin).toBe(false);
    expect(p.canModerate).toBe(false);
    expect(p.canManageChannelMembers).toBe(false);
    expect(p.canBroadcast).toBe(false);
  });

  it("handles the empty-channelRoles-serializes-as-array caveat", () => {
    // Core serializes an empty PHP assoc array as JSON `[]`; index access
    // must still behave like a miss rather than throwing.
    const p = getChannelPermissions(
      community(),
      channel({ id: 3 }),
      user(),
      membership({
        hasMembership: true,
        channelRoles: [] as unknown as Record<number, "member" | "moderator">,
      }),
    );
    expect(p.isChannelModerator).toBe(false);
    expect(p.canViewMembers).toBe(false);
  });
});
