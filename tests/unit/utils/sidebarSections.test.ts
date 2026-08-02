import { describe, it, expect } from "vitest";
import { buildSidebarSections } from "@/utils/sidebarSections";
import type { Channel, ChannelSection } from "@/types/api";

function section(id: number, name: string): ChannelSection {
  return {
    "@id": `/api/sections/${id}`,
    "@type": "ChannelSection",
    id,
    name,
    identifier: name.toLowerCase(),
    position: 0,
  };
}
function channel(id: number, identifier: string, sectionId: number): Channel {
  return {
    "@id": `/api/channels/${id}`,
    "@type": "Channel",
    id,
    name: identifier,
    identifier,
    position: 0,
    section: section(sectionId, "General"),
  };
}

const labels = { favorites: "Favorites", hidden: "Hidden", archived: "Archived" };

describe("buildSidebarSections", () => {
  it("orders favorites first, real sections middle, hidden last", () => {
    const sections = [section(1, "Text"), section(2, "Voice")];
    const channels = [channel(10, "alpha", 1), channel(11, "beta", 1), channel(12, "gamma", 2)];
    const result = buildSidebarSections({
      sections,
      channels,
      communityId: "c1",
      pinStateByChannelId: new Map([
        [10, "favorite"],
        [12, "hidden"],
      ]),
      collapseMap: {},
      unreadIdentifiers: new Set(),
      labels,
    });
    expect(result.map((s) => s.kind)).toEqual(["favorites", "real", "real", "hidden"]);
    expect(result[0]!.channels.map((c) => c.id)).toEqual([10]);
    const textSection = result.find((s) => s.section?.id === 1);
    expect(textSection?.channels.map((c) => c.id)).toEqual([11]);
    expect(result.at(-1)!.channels.map((c) => c.id)).toEqual([12]);
  });

  it("omits empty virtual sections", () => {
    const result = buildSidebarSections({
      sections: [section(1, "Text")],
      channels: [channel(10, "alpha", 1)],
      communityId: "c1",
      pinStateByChannelId: new Map(),
      collapseMap: {},
      unreadIdentifiers: new Set(),
      labels,
    });
    expect(result.map((s) => s.kind)).toEqual(["real"]);
  });

  it("defaults Hidden collapsed, others expanded; map overrides", () => {
    const result = buildSidebarSections({
      sections: [section(1, "Text")],
      channels: [channel(10, "alpha", 1), channel(11, "beta", 1)],
      communityId: "c1",
      pinStateByChannelId: new Map([[11, "hidden"]]),
      collapseMap: { "/api/sections/1": true },
      unreadIdentifiers: new Set(),
      labels,
    });
    const real = result.find((s) => s.kind === "real");
    const hidden = result.find((s) => s.kind === "hidden");
    expect(real?.collapsed).toBe(true);
    expect(hidden?.collapsed).toBe(true);
  });

  it("sets hasUnread when any child channel is unread", () => {
    const result = buildSidebarSections({
      sections: [section(1, "Text")],
      channels: [channel(10, "alpha", 1), channel(11, "beta", 1)],
      communityId: "c1",
      pinStateByChannelId: new Map([[11, "hidden"]]),
      collapseMap: {},
      unreadIdentifiers: new Set(["beta"]),
      labels,
    });
    const hidden = result.find((s) => s.kind === "hidden");
    expect(hidden?.hasUnread).toBe(true);
  });

  it("puts archived channels in a trailing archived section, overriding pin state", () => {
    const sections = [section(1, "Text")];
    const channels = [
      channel(10, "alpha", 1),
      { ...channel(11, "beta", 1), archivedAt: "2026-07-01T00:00:00+00:00" },
      { ...channel(12, "gamma", 1), archivedAt: "2026-07-01T00:00:00+00:00" },
    ];
    const result = buildSidebarSections({
      sections,
      channels,
      communityId: "c1",
      pinStateByChannelId: new Map([[11, "favorite"]]),
      collapseMap: {},
      unreadIdentifiers: new Set(),
      labels,
    });
    expect(result.map((s) => s.kind)).toEqual(["real", "archived"]);
    expect(result[1]!.channels.map((c) => c.id)).toEqual([11, 12]);
    expect(result[1]?.collapsed).toBe(true);
    expect(result[1]?.name).toBe("Archived");
  });

  it("omits the archived section when no channel is archived", () => {
    const result = buildSidebarSections({
      sections: [section(1, "Text")],
      channels: [channel(10, "alpha", 1)],
      communityId: "c1",
      pinStateByChannelId: new Map(),
      collapseMap: {},
      unreadIdentifiers: new Set(),
      labels,
    });
    expect(result.every((s) => s.kind !== "archived")).toBe(true);
  });

  it("marks a real section non-empty even when its only channel is favorited, hidden or archived", () => {
    const sections = [section(1, "Fav"), section(2, "Hid"), section(3, "Arch"), section(4, "Void")];
    const channels = [
      channel(10, "alpha", 1),
      channel(11, "beta", 2),
      { ...channel(12, "gamma", 3), archivedAt: "2026-07-01T00:00:00+00:00" },
    ];
    const result = buildSidebarSections({
      sections,
      channels,
      communityId: "c1",
      pinStateByChannelId: new Map([
        [10, "favorite"],
        [11, "hidden"],
      ]),
      collapseMap: {},
      unreadIdentifiers: new Set(),
      labels,
    });
    const bySectionId = (id: number) => result.find((s) => s.section?.id === id)!;
    expect(bySectionId(1).isEmpty).toBe(false);
    expect(bySectionId(2).isEmpty).toBe(false);
    expect(bySectionId(3).isEmpty).toBe(false);
    expect(bySectionId(4).isEmpty).toBe(true);
    expect(bySectionId(1).channels).toEqual([]);
  });
});
