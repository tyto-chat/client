import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { Route } from "@/routes/_app/$communityId/$channelId";
import { queryKeys } from "@/queries/queryKeys";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";

const COMMUNITY = "comm-1";

const community = {
  "@id": `/api/communities/${COMMUNITY}`,
  "@type": "Community",
  id: 1,
  identifier: COMMUNITY,
  name: "Comm",
  channels: [
    {
      "@id": `/api/communities/${COMMUNITY}/channels/general`,
      "@type": "Channel",
      id: 10,
      name: "general",
      identifier: "general",
      position: 0,
      type: "audio",
      section: {
        "@id": `/api/communities/${COMMUNITY}/sections/1`,
        "@type": "ChannelSection",
        id: 1,
        name: "General",
        identifier: "general",
        position: 0,
      },
    },
  ],
  channelSections: [],
};

function runLoader(channelId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(queryKeys.community(COMMUNITY), community);
  const loader = Route.options.loader as (args: unknown) => Promise<unknown>;
  return loader({
    context: { queryClient, auth: { token: null } },
    params: { communityId: COMMUNITY, channelId },
    deps: {},
  });
}

beforeEach(() => {
  configureApiClient(BASE);
});

describe("channel route loader", () => {
  it("redirects to the community root when the channel identifier is unknown", async () => {
    let thrown: unknown;
    try {
      await runLoader("no-such-channel");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as { options: { to: string } }).options.to).toBe("/$communityId");
  });

  it("returns loader data for a known channel", async () => {
    const result = await runLoader("general");
    expect(result).toMatchObject({ latestPageNumber: 1 });
  });
});
