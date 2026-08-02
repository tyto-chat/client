import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { fetchTwoFactorStatus, confirmTwoFactor } from "@/api/twoFactor";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("jwt-abc");
});

describe("twoFactor api", () => {
  it("fetches status", async () => {
    server.use(
      http.get(`${BASE}/api/v1/users/me/2fa`, () =>
        HttpResponse.json({
          enabled: true,
          enabledAt: "2026-07-20T00:00:00+00:00",
          recoveryCodesRemaining: 7,
        }),
      ),
    );
    const status = await fetchTwoFactorStatus();
    expect(status.enabled).toBe(true);
    expect(status.recoveryCodesRemaining).toBe(7);
  });

  it("confirms and returns recovery codes", async () => {
    server.use(
      http.post(`${BASE}/api/v1/users/me/2fa/confirm`, () =>
        HttpResponse.json({ recoveryCodes: ["aaaaa-bbbbb"] }),
      ),
    );
    const result = await confirmTwoFactor("123456");
    expect(result.recoveryCodes).toEqual(["aaaaa-bbbbb"]);
  });
});
