import { describe, it, expect } from "vitest";
import { communityTileStyle } from "@/utils/communityTile";
import type { Community } from "@/types/api";

function community(overrides: Partial<Community>): Community {
  return {
    id: 1,
    identifier: "test",
    name: "Test",
    accentColor: null,
    ...overrides,
  } as Community;
}

describe("communityTileStyle", () => {
  it("returns no style when a logo is present", () => {
    const c = community({
      logo: { contentUrl: { sm: "https://x/logo.png" } },
    } as Partial<Community>);
    expect(communityTileStyle(c)).toEqual({});
  });

  it("builds a gradient from the community accent colour", () => {
    const style = communityTileStyle(community({ accentColor: "#22d3ee" }));
    expect(String(style.backgroundImage)).toContain("#22d3ee");
  });

  it("falls back to the identifier when @id is absent (plain-JSON payloads)", () => {
    const a = communityTileStyle(community({ identifier: "alpha" }));
    const b = communityTileStyle(community({ identifier: "beta" }));
    expect(a.backgroundImage).toBeTruthy();
    expect(a.backgroundImage).not.toBe(b.backgroundImage);
  });
});
