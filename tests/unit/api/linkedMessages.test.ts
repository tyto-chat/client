import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { IdentityFetchError } from "@/desktop/connections/identityFetch";
import {
  fetchChannelIn,
  fetchCommunityIn,
  fetchEmojisIn,
  fetchMessageIn,
} from "@/api/linkedMessages";
import type { LinkScope } from "@/utils/linkScope";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { fakeEndpoint } from "../../mocks/serverDirectory";

const FOREIGN = "https://b.example";
const foreign: LinkScope = { kind: "foreign", endpoint: fakeEndpoint("ib", FOREIGN) };
const current: LinkScope = { kind: "current" };
const UUID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("current-token");
});

describe("fetchMessageIn", () => {
  it("sends the endpoint token to the endpoint origin only", async () => {
    let auth: string | null = null;
    let reachedCurrent = false;
    server.use(
      http.get(`${FOREIGN}/api/v1/messages/${UUID}`, ({ request }) => {
        auth = request.headers.get("Authorization");
        return HttpResponse.json({ id: UUID, text: "hi" });
      }),
      http.get(`${BASE}/api/v1/messages/${UUID}`, () => {
        reachedCurrent = true;
        return HttpResponse.json({});
      }),
    );

    const message = await fetchMessageIn(foreign, UUID);

    expect(message).toMatchObject({ text: "hi" });
    expect(auth).toBe("Bearer token-ib");
    expect(reachedCurrent).toBe(false);
  });

  it("uses the active api client for the current scope", async () => {
    let auth: string | null = null;
    server.use(
      http.get(`${BASE}/api/v1/messages/${UUID}`, ({ request }) => {
        auth = request.headers.get("Authorization");
        return HttpResponse.json({ id: UUID, text: "local" });
      }),
    );

    expect(await fetchMessageIn(current, UUID)).toMatchObject({ text: "local" });
    expect(auth).toBe("Bearer current-token");
  });

  it("rejects with the status on a foreign 404", async () => {
    server.use(
      http.get(`${FOREIGN}/api/v1/messages/${UUID}`, () => new HttpResponse(null, { status: 404 })),
    );
    await expect(fetchMessageIn(foreign, UUID)).rejects.toMatchObject({
      constructor: IdentityFetchError,
      status: 404,
    });
  });
});

describe("foreign lookups", () => {
  it("fetches a channel", async () => {
    server.use(
      http.get(`${FOREIGN}/api/v1/communities/c1/channels/general`, () =>
        HttpResponse.json({ name: "general" }),
      ),
    );
    expect(await fetchChannelIn(foreign, "c1", "general")).toMatchObject({ name: "general" });
  });

  it("fetches a community", async () => {
    server.use(
      http.get(`${FOREIGN}/api/v1/communities/c1`, () => HttpResponse.json({ name: "Tyto" })),
    );
    expect(await fetchCommunityIn(foreign, "c1")).toMatchObject({ name: "Tyto" });
  });

  it("unwraps the emoji collection", async () => {
    server.use(
      http.get(`${FOREIGN}/api/v1/communities/c1/emojis`, () =>
        HttpResponse.json({ "hydra:member": [{ shortcode: "owl" }] }),
      ),
    );
    expect(await fetchEmojisIn(foreign, "c1")).toEqual([{ shortcode: "owl" }]);
  });
});
