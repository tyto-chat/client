import { describe, it, expect, beforeEach } from "vitest";
import {
  readLastLocation,
  writeLastLocation,
  takeLastLocation,
  type LastLocation,
} from "@/utils/lastLocation";

const channelLoc: LastLocation = { kind: "channel", communityId: "tyto", channelId: "general" };
const dmLoc: LastLocation = { kind: "dm", conversationId: "abc-123" };

beforeEach(() => {
  localStorage.clear();
});

describe("lastLocation", () => {
  it("round-trips a channel location for the same user", () => {
    writeLastLocation(7, channelLoc);
    expect(readLastLocation(7)).toEqual(channelLoc);
  });

  it("round-trips a dm location", () => {
    writeLastLocation(7, dmLoc);
    expect(readLastLocation(7)).toEqual(dmLoc);
  });

  it("ignores a location stored by a different user", () => {
    writeLastLocation(7, channelLoc);
    expect(readLastLocation(8)).toBeNull();
  });

  it("takeLastLocation consumes the value", () => {
    writeLastLocation(7, channelLoc);
    expect(takeLastLocation(7)).toEqual(channelLoc);
    expect(readLastLocation(7)).toBeNull();
  });

  it("returns null for corrupt payloads", () => {
    localStorage.setItem("tyto:last-location", "{not json");
    expect(readLastLocation(7)).toBeNull();
  });

  it("returns null for unknown kinds", () => {
    localStorage.setItem(
      "tyto:last-location",
      JSON.stringify({ userId: 7, kind: "voice", channelId: "x" }),
    );
    expect(readLastLocation(7)).toBeNull();
  });
});
