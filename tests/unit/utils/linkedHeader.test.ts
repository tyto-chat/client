import { describe, expect, it } from "vitest";
import { linkedHeaderParts } from "@/utils/linkedHeader";
import type { Message } from "@/types/api";
import type { LinkScope } from "@/utils/linkScope";
import { fakeEndpoint } from "../../mocks/serverDirectory";

const current: LinkScope = { kind: "current" };
const foreign: LinkScope = { kind: "foreign", endpoint: fakeEndpoint("ib", "https://b.example") };
const places = { channel: "general", community: "Tyto HQ", server: "Beta" };
const message = { communityIdentifier: "hq", channelIdentifier: "general" } as Message;
const dm = {
  conversationIdentifier: "c-1",
  communityIdentifier: null,
  channelIdentifier: null,
} as Message;

describe("linkedHeaderParts", () => {
  it("shows only the channel for the same community", () => {
    expect(linkedHeaderParts({ scope: current, hostCommunityId: "hq", message, places })).toEqual([
      "#general",
    ]);
  });

  it("adds the community for another community on the same server", () => {
    expect(
      linkedHeaderParts({ scope: current, hostCommunityId: "other", message, places }),
    ).toEqual(["#general", "Tyto HQ"]);
  });

  it("treats a host without a community as another community", () => {
    expect(
      linkedHeaderParts({ scope: current, hostCommunityId: undefined, message, places }),
    ).toEqual(["#general", "Tyto HQ"]);
  });

  it("adds the server for another server, even with the same community identifier", () => {
    expect(linkedHeaderParts({ scope: foreign, hostCommunityId: "hq", message, places })).toEqual([
      "#general",
      "Tyto HQ",
      "Beta",
    ]);
  });

  it("shows no header for a direct message", () => {
    expect(
      linkedHeaderParts({ scope: current, hostCommunityId: "hq", message: dm, places }),
    ).toEqual([]);
    expect(
      linkedHeaderParts({ scope: foreign, hostCommunityId: "hq", message: dm, places }),
    ).toEqual([]);
  });

  it("drops parts that have no name", () => {
    expect(
      linkedHeaderParts({
        scope: foreign,
        hostCommunityId: "hq",
        message,
        places: { channel: null, community: "Tyto HQ", server: null },
      }),
    ).toEqual(["Tyto HQ"]);
  });
});
