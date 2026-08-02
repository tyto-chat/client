import type { Channel, ChannelSection, ChannelPinState } from "@/types/api";

export interface SidebarSection {
  key: string;
  kind: "favorites" | "real" | "hidden" | "archived";
  name: string;
  section: ChannelSection | null;
  channels: Channel[];
  collapsed: boolean;
  hasUnread: boolean;
  isEmpty: boolean;
}

interface Params {
  sections: ChannelSection[];
  channels: Channel[];
  communityId: string;
  pinStateByChannelId: Map<number, ChannelPinState | null>;
  collapseMap: Record<string, boolean>;
  unreadIdentifiers: Set<string>;
  labels: { favorites: string; hidden: string; archived: string };
}

function collapsedFor(
  key: string,
  kind: SidebarSection["kind"],
  map: Record<string, boolean>,
): boolean {
  const stored = map[key];
  if (stored !== undefined) return stored;
  return kind === "hidden" || kind === "archived";
}

function byIdentifier(a: Channel, b: Channel): number {
  return a.identifier.localeCompare(b.identifier);
}

export function buildSidebarSections({
  sections,
  channels,
  communityId,
  pinStateByChannelId,
  collapseMap,
  unreadIdentifiers,
  labels,
}: Params): SidebarSection[] {
  const favorites: Channel[] = [];
  const hidden: Channel[] = [];
  const archived: Channel[] = [];
  const realBySection = new Map<number, Channel[]>();

  for (const ch of channels) {
    if (ch.archivedAt) {
      archived.push(ch);
      continue;
    }
    const pin = pinStateByChannelId.get(ch.id) ?? null;
    if (pin === "favorite") {
      favorites.push(ch);
    } else if (pin === "hidden") {
      hidden.push(ch);
    } else {
      const list = realBySection.get(ch.section.id) ?? [];
      list.push(ch);
      realBySection.set(ch.section.id, list);
    }
  }

  const hasUnread = (list: Channel[]) => list.some((c) => unreadIdentifiers.has(c.identifier));
  const out: SidebarSection[] = [];

  if (favorites.length > 0) {
    const key = `fav:${communityId}`;
    favorites.sort(byIdentifier);
    out.push({
      key,
      kind: "favorites",
      name: labels.favorites,
      section: null,
      channels: favorites,
      collapsed: collapsedFor(key, "favorites", collapseMap),
      hasUnread: hasUnread(favorites),
      isEmpty: false,
    });
  }

  for (const section of sections) {
    const list = (realBySection.get(section.id) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    const key = section["@id"];
    out.push({
      key,
      kind: "real",
      name: section.name,
      section,
      channels: list,
      collapsed: collapsedFor(key, "real", collapseMap),
      hasUnread: hasUnread(list),
      isEmpty: !channels.some((ch) => ch.section.id === section.id),
    });
  }

  if (hidden.length > 0) {
    const key = `hidden:${communityId}`;
    hidden.sort(byIdentifier);
    out.push({
      key,
      kind: "hidden",
      name: labels.hidden,
      section: null,
      channels: hidden,
      collapsed: collapsedFor(key, "hidden", collapseMap),
      hasUnread: hasUnread(hidden),
      isEmpty: false,
    });
  }

  if (archived.length > 0) {
    const key = `archived:${communityId}`;
    archived.sort(byIdentifier);
    out.push({
      key,
      kind: "archived",
      name: labels.archived,
      section: null,
      channels: archived,
      collapsed: collapsedFor(key, "archived", collapseMap),
      hasUnread: hasUnread(archived),
      isEmpty: false,
    });
  }

  return out;
}
