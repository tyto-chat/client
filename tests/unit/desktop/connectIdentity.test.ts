import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { connectIdentity } from "@/desktop/connectIdentity";
import { secretKey } from "@/desktop/desktopConfig";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { setRefreshExecutor } from "@/api/auth";

const ORIGIN = "https://srv.example";
const identity = { id: "i1", serverUrl: ORIGIN, email: "a@b.c", userId: null, displayName: null };

function stubServer() {
  server.use(
    http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    http.get(`${ORIGIN}/api/v1/server-info`, () =>
      HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "Srv" }),
    ),
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => setRefreshExecutor(null));

describe("connectIdentity", () => {
  it("returns unreachable when version negotiation fails", async () => {
    server.use(http.get(`${ORIGIN}/api/versions`, () => HttpResponse.error()));
    const outcome = await connectIdentity(createFakePlatformBridge(), "p1", identity);
    expect(outcome.status).toBe("unreachable");
  });

  it("returns needs-login without a stored refresh token", async () => {
    stubServer();
    const outcome = await connectIdentity(createFakePlatformBridge(), "p1", identity);
    expect(outcome.status).toBe("needs-login");
  });

  it("returns needs-login when the refresh token is rejected", async () => {
    stubServer();
    server.use(
      http.post(`${ORIGIN}/api/token/refresh`, () =>
        HttpResponse.json({ error: "invalid" }, { status: 401 }),
      ),
    );
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey("p1", "i1", "refreshToken"), "dead");
    const outcome = await connectIdentity(bridge, "p1", identity);
    expect(outcome.status).toBe("needs-login");
  });

  it("connects and persists a rotated refresh token", async () => {
    stubServer();
    server.use(
      http.post(`${ORIGIN}/api/token/refresh`, () =>
        HttpResponse.json({ token: "jwt-live", refresh_token: "rotated" }),
      ),
    );
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey("p1", "i1", "refreshToken"), "old");
    const outcome = await connectIdentity(bridge, "p1", identity);
    expect(outcome).toMatchObject({ status: "connected", token: "jwt-live" });
    expect(await bridge.secrets.get(secretKey("p1", "i1", "refreshToken"))).toBe("rotated");
  });
});
