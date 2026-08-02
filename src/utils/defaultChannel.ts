import type { Channel, ChannelSection } from "@/types/api";

export function defaultChannelFor(community: {
  channels: Channel[];
  channelSections: ChannelSection[];
  welcomeChannel?: Channel | null;
}): Channel | null {
  const isLandable = (c: Channel) => c.type !== "audio" && c.isPrivate !== true;

  const welcomeIdentifier = community.welcomeChannel?.identifier;
  if (welcomeIdentifier) {
    const welcome = community.channels.find(
      (c) => c.identifier === welcomeIdentifier && isLandable(c),
    );
    if (welcome) return welcome;
  }

  const sectionOrder = new Map(community.channelSections.map((s, i) => [s.id, i]));
  const candidates = community.channels
    .filter(isLandable)
    .sort(
      (a, b) =>
        (sectionOrder.get(a.section.id) ?? Number.MAX_SAFE_INTEGER) -
          (sectionOrder.get(b.section.id) ?? Number.MAX_SAFE_INTEGER) || a.position - b.position,
    );
  return candidates[0] ?? null;
}
