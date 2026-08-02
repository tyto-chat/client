import { describe, it, expect } from "vitest";
import { buildSidebarSections } from "@/utils/sidebarSections";
import type { Channel, ChannelSection } from "@/types/api";

const section = (id: number, position: number): ChannelSection =>
  ({
    "@id": `/api/sections/${id}`,
    id,
    name: `s${id}`,
    identifier: `s${id}`,
    position,
  }) as ChannelSection;

const channel = (id: number, sectionId: number, position: number): Channel =>
  ({
    "@id": `/api/channels/${id}`,
    id,
    name: `c${id}`,
    identifier: `c${id}`,
    position,
    type: "text",
    section: { "@id": `/api/sections/${sectionId}`, id: sectionId } as ChannelSection,
  }) as Channel;

describe("buildSidebarSections position ordering", () => {
  it("orders within-section channels by position ascending", () => {
    const out = buildSidebarSections({
      sections: [section(1, 0)],
      channels: [channel(20, 1, 2), channel(21, 1, 0), channel(22, 1, 1)],
      communityId: "comm",
      pinStateByChannelId: new Map(),
      collapseMap: {},
      unreadIdentifiers: new Set(),
      labels: { favorites: "Favorites", hidden: "Hidden", archived: "Archived" },
    });
    const real = out.find((s) => s.kind === "real");
    expect(real?.channels.map((c) => c.id)).toEqual([21, 22, 20]);
  });
});
