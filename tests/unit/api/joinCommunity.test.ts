import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { joinCommunity } from "@/api/communities";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("jwt");
});

describe("joinCommunity", () => {
  it("resolves the identifier on a 204 without a body", async () => {
    server.use(
      http.post(
        `${BASE}/api/v1/communities/gamers/members`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    await expect(joinCommunity("gamers")).resolves.toBe("gamers");
  });

  it("rejects when the server denies the join", async () => {
    server.use(
      http.post(`${BASE}/api/v1/communities/private-club/members`, () =>
        HttpResponse.json({ error: "denied" }, { status: 403 }),
      ),
    );

    await expect(joinCommunity("private-club")).rejects.toThrow();
  });
});
