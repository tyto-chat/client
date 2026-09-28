import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { createChallenge } from "@/api/challenges";
import { requestPasswordReset } from "@/api/users";

let bodies: Record<string, unknown>;

beforeEach(() => {
  bodies = {};
  configureApiClient(BASE);
  server.use(
    http.post(`${BASE}/api/v1/challenges`, async ({ request }) => {
      bodies.challenge = await request.json();
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(`${BASE}/api/v1/reset_password`, async ({ request }) => {
      bodies.reset = await request.json();
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

afterEach(() => vi.unstubAllEnvs());

describe("client context on register and reset requests", () => {
  it.each([
    ["web", "web"],
    ["desktop", "desktop"],
    ["mobile", "mobile"],
    ["", "web"],
  ])("sends client=%s as %s", async (mode, expected) => {
    vi.stubEnv("VITE_APP_MODE", mode);

    await createChallenge("a@b.c");
    await requestPasswordReset("a@b.c");

    expect(bodies.challenge).toEqual({ email: "a@b.c", client: expected });
    expect(bodies.reset).toEqual({ email: "a@b.c", client: expected });
  });
});
