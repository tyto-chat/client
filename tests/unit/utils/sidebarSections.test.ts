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
    expect(result.map((s) => s.kind)).toEqual(["favorites", "real", "hidden"]);
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

  it("omits a real section whose channels are all favorited, hidden or archived, but keeps a truly empty one", () => {
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
    const real = result.filter((s) => s.kind === "real");
    expect(real.map((s) => s.section?.id)).toEqual([4]);
    expect(real[0]!.isEmpty).toBe(true);
  });

  it("keeps such a section for people who manage sections, so its menu stays reachable", () => {
    const result = buildSidebarSections({
      sections: [section(1, "Fav")],
      channels: [channel(10, "alpha", 1)],
      communityId: "c1",
      pinStateByChannelId: new Map([[10, "favorite"]]),
      collapseMap: {},
      unreadIdentifiers: new Set(),
      labels,
      keepSectionsWithoutListedChannels: true,
    });
    const real = result.find((s) => s.kind === "real");
    expect(real?.channels).toEqual([]);
    expect(real?.isEmpty).toBe(false);
  });

  it("keeps a real section while at least one of its channels is still listed in it", () => {
    const result = buildSidebarSections({
      sections: [section(1, "Text")],
      channels: [channel(10, "alpha", 1), channel(11, "beta", 1)],
      communityId: "c1",
      pinStateByChannelId: new Map([[10, "favorite"]]),
      collapseMap: {},
      unreadIdentifiers: new Set(),
      labels,
    });
    const real = result.find((s) => s.kind === "real");
    expect(real?.channels.map((c) => c.id)).toEqual([11]);
    expect(real?.isEmpty).toBe(false);
  });

  it("lists channels without a section in an unsectioned group before the real sections", () => {
    const sections = [section(1, "Text")];
    const loose: Channel = { ...channel(20, "loose", 1), section: null, position: 1 };
    const looser: Channel = { ...channel(21, "first", 1), section: null, position: 0 };
    const result = buildSidebarSections({
      sections,
      channels: [channel(10, "alpha", 1), loose, looser],
      communityId: "c1",
      pinStateByChannelId: new Map(),
      collapseMap: {},
      unreadIdentifiers: new Set(),
      labels,
    });
    expect(result.map((s) => s.kind)).toEqual(["unsectioned", "real"]);
    expect(result[0]!.channels.map((c) => c.id)).toEqual([21, 20]);
    expect(result[0]!.collapsed).toBe(false);
    expect(result[1]!.channels.map((c) => c.id)).toEqual([10]);
    expect(result[1]!.isEmpty).toBe(false);
  });
});
