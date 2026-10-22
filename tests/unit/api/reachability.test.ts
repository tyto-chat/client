import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { apiClient, configureApiClient } from "@/api/client";
import { isServerUnreachable, recordNetworkSuccess } from "@/api/reachability";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";

async function failTimes(n: number) {
  for (let i = 0; i < n; i++) await apiClient.get("/api/down").catch(() => {});
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken(null);
  recordNetworkSuccess();
  server.use(
    http.get(`${BASE}/api/v1/down`, () => HttpResponse.error()),
    http.get(`${BASE}/api/v1/gateway`, () => new HttpResponse(null, { status: 502 })),
    http.get(`${BASE}/api/v1/missing`, () => HttpResponse.json({}, { status: 404 })),
    http.get(`${BASE}/api/v1/up`, () => HttpResponse.json({ ok: true })),
  );
});

describe("server reachability", () => {
  it("tolerates isolated network failures", async () => {
    await failTimes(2);
    expect(isServerUnreachable()).toBe(false);
  });

  it("marks the server unreachable after consecutive network failures", async () => {
    await failTimes(3);
    expect(isServerUnreachable()).toBe(true);
  });

  it("counts gateway errors as network failures", async () => {
    for (let i = 0; i < 3; i++) await apiClient.get("/api/gateway").catch(() => {});
    expect(isServerUnreachable()).toBe(true);
  });

  it("treats any server answer, even an error, as reachable", async () => {
    await failTimes(3);
    await apiClient.get("/api/missing").catch(() => {});
    expect(isServerUnreachable()).toBe(false);
  });

  it("recovers on the next successful request", async () => {
    await failTimes(3);
    await apiClient.get("/api/up");
    expect(isServerUnreachable()).toBe(false);
  });

  it("resets when switching to another server", async () => {
    await failTimes(3);
    configureApiClient("https://other.example");
    expect(isServerUnreachable()).toBe(false);
  });
});
