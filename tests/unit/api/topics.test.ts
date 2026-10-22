import { describe, it, expect } from "vitest";
import {
  userNotificationsTopic,
  userEventsTopic,
  conversationActivityTopic,
  userPresenceTopic,
  communityTopic,
  communityActivityTopic,
  communityEmojisTopic,
  channelTopic,
  channelThreadsTopic,
  channelParticipantsTopic,
  conversationTopic,
  conversationThreadsTopic,
} from "@/api/topics";

describe("realtime topics", () => {
  it.each([
    [userNotificationsTopic, "u/42/n"],
    [userEventsTopic, "u/42/e"],
    [conversationActivityTopic, "u/42/d"],
    [userPresenceTopic, "u/42/p"],
    [communityTopic, "k/42"],
    [communityActivityTopic, "k/42/a"],
    [communityEmojisTopic, "k/42/e"],
    [channelTopic, "c/42"],
    [channelThreadsTopic, "c/42/t"],
    [channelParticipantsTopic, "c/42/p"],
    [conversationTopic, "m/42"],
    [conversationThreadsTopic, "m/42/t"],
  ])("builds %#", (build, expected) => {
    expect(build(42)).toBe(expected);
  });
});
