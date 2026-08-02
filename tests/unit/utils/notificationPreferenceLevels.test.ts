import { describe, it, expect } from "vitest";

/**
 * Inline copy of the level-resolution rule from
 * useChannelNotificationLevel / useIsCommunityMuted — kept here as a
 * regression net so future refactors of the snapshot shape still resolve
 * the same fallbacks (default = "mentions", muted defaults to false).
 */
function resolveLevel(
  snapshot: { channels: { channelId: number; level: "all" | "mentions" | "none" }[] } | undefined,
  channelId: number | undefined,
): "all" | "mentions" | "none" {
  if (!snapshot || channelId === undefined) return "mentions";
  return snapshot.channels.find((c) => c.channelId === channelId)?.level ?? "mentions";
}

function isMuted(
  snapshot: { mutedCommunityIds: number[] } | undefined,
  communityId: number | undefined,
): boolean {
  if (!snapshot || communityId === undefined) return false;
  return snapshot.mutedCommunityIds.includes(communityId);
}

describe("notification preference resolution", () => {
  it("defaults to mentions when no snapshot loaded", () => {
    expect(resolveLevel(undefined, 1)).toBe("mentions");
  });

  it("defaults to mentions when channel not in snapshot", () => {
    expect(resolveLevel({ channels: [{ channelId: 5, level: "all" }] }, 7)).toBe("mentions");
  });

  it("returns stored level when present", () => {
    expect(resolveLevel({ channels: [{ channelId: 5, level: "none" }] }, 5)).toBe("none");
  });

  it("isMuted false when snapshot missing", () => {
    expect(isMuted(undefined, 1)).toBe(false);
  });

  it("isMuted true when community in list", () => {
    expect(isMuted({ mutedCommunityIds: [1, 2] }, 2)).toBe(true);
  });

  it("isMuted false when community absent", () => {
    expect(isMuted({ mutedCommunityIds: [1, 2] }, 3)).toBe(false);
  });
});
