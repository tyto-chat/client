import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import {
  authRestored,
  beginAuthRestore,
  finishAuthRestore,
  setAccessToken,
} from "@/api/tokenStore";
import { apiClient, configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken(null);
  finishAuthRestore();
});

describe("auth restore gate", () => {
  it("is resolved by default so plain calls never block", async () => {
    await expect(authRestored()).resolves.toBeUndefined();
  });

  it("holds requests until finished, then sends them with the restored token", async () => {
    let seenAuth: string | null = null;
    server.use(
      http.get(`${BASE}/api/v1/ping`, ({ request }) => {
        seenAuth = request.headers.get("Authorization");
        return HttpResponse.json({ ok: true });
      }),
    );

    beginAuthRestore();
    const pending = apiClient.getJson<{ ok: boolean }>("/api/ping");

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seenAuth).toBeNull();

    setAccessToken("restored-jwt");
    finishAuthRestore();

    await expect(pending).resolves.toEqual({ ok: true });
    expect(seenAuth).toBe("Bearer restored-jwt");
  });

  it("finishing twice is harmless", () => {
    beginAuthRestore();
    finishAuthRestore();
    finishAuthRestore();
    return expect(authRestored()).resolves.toBeUndefined();
  });
});
