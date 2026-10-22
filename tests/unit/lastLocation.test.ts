import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readLastLocation, takeLastLocation, writeLastLocation } from "@/utils/lastLocation";
import { setActiveIdentityKey } from "@/platform/activeIdentity";

describe("lastLocation", () => {
  beforeEach(() => {
    localStorage.clear();
    setActiveIdentityKey(null);
  });

  afterEach(() => setActiveIdentityKey(null));

  it("restores the location saved by the same user", () => {
    writeLastLocation(1, { kind: "channel", communityId: "c", channelId: "general" });

    expect(takeLastLocation(1)).toEqual({
      kind: "channel",
      communityId: "c",
      channelId: "general",
    });
    expect(readLastLocation(1)).toBeNull();
  });

  it("ignores a location saved by another user", () => {
    writeLastLocation(1, { kind: "dm", conversationId: "x" });

    expect(readLastLocation(2)).toBeNull();
  });

  it("ignores a location saved on another server with the same user id", () => {
    setActiveIdentityKey("server-a");
    writeLastLocation(1, { kind: "channel", communityId: "tyto-chat", channelId: "general" });

    setActiveIdentityKey("server-b");
    expect(readLastLocation(1)).toBeNull();

    setActiveIdentityKey("server-a");
    expect(readLastLocation(1)).toEqual({
      kind: "channel",
      communityId: "tyto-chat",
      channelId: "general",
    });
  });
});
