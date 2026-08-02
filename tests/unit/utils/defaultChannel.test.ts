import { describe, it, expect } from "vitest";
import { defaultChannelFor } from "@/utils/defaultChannel";
import type { Channel, ChannelSection } from "@/types/api";

function section(id: number): ChannelSection {
  return { "@id": `/api/v1/channel_sections/${id}`, id, name: `s${id}` } as ChannelSection;
}

function channel(
  id: number,
  identifier: string,
  sectionId: number,
  position: number,
  type?: "text" | "audio",
  isPrivate?: boolean,
): Channel {
  return {
    "@id": `/api/v1/channels/${id}`,
    id,
    name: identifier,
    identifier,
    position,
    section: section(sectionId),
    type,
    isPrivate,
  } as Channel;
}

describe("defaultChannelFor", () => {
  it("skips audio channels even when they come first in the payload", () => {
    const result = defaultChannelFor({
      channelSections: [section(1)],
      channels: [channel(4, "voice-1", 1, 0, "audio"), channel(2, "general", 1, 1, "text")],
    });
    expect(result?.identifier).toBe("general");
  });

  it("follows section order then channel position, not payload order", () => {
    const result = defaultChannelFor({
      channelSections: [section(2), section(1)],
      channels: [
        channel(10, "later-section", 1, 0, "text"),
        channel(11, "first-section-second", 2, 5, "text"),
        channel(12, "first-section-first", 2, 1, "text"),
      ],
    });
    expect(result?.identifier).toBe("first-section-first");
  });

  it("returns null when only audio channels exist", () => {
    const result = defaultChannelFor({
      channelSections: [section(1)],
      channels: [channel(4, "voice-1", 1, 0, "audio")],
    });
    expect(result).toBeNull();
  });

  it("treats untyped channels as text", () => {
    const result = defaultChannelFor({
      channelSections: [section(1)],
      channels: [channel(4, "voice-1", 1, 0, "audio"), channel(2, "legacy", 1, 1)],
    });
    expect(result?.identifier).toBe("legacy");
  });

  it("prefers the welcome channel when set", () => {
    const welcome = channel(9, "welcome", 1, 3, "text");
    const result = defaultChannelFor({
      channelSections: [section(1)],
      channels: [channel(2, "general", 1, 0, "text"), welcome],
      welcomeChannel: welcome,
    });
    expect(result?.identifier).toBe("welcome");
  });

  it("falls back when the welcome channel is not in the channel list", () => {
    const result = defaultChannelFor({
      channelSections: [section(1)],
      channels: [channel(2, "general", 1, 0, "text")],
      welcomeChannel: channel(9, "gone", 1, 3, "text"),
    });
    expect(result?.identifier).toBe("general");
  });

  it("skips private channels in the fallback walk", () => {
    const result = defaultChannelFor({
      channelSections: [section(1)],
      channels: [channel(2, "secret", 1, 0, "text", true), channel(3, "open", 1, 1, "text", false)],
    });
    expect(result?.identifier).toBe("open");
  });

  it("returns null when every text channel is private", () => {
    const result = defaultChannelFor({
      channelSections: [section(1)],
      channels: [channel(2, "secret", 1, 0, "text", true)],
    });
    expect(result).toBeNull();
  });
});
