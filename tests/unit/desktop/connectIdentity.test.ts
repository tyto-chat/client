import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { connectIdentity, resolveServerQuiet } from "@/desktop/connectIdentity";
import { secretKey } from "@/desktop/desktopConfig";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { setRefreshExecutor } from "@/api/auth";
import { getServerInfo } from "@/api/serverInfo";
import { _resetNegotiationForTests, negotiateApiVersion, supportsFeature } from "@/api/apiVersion";

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

beforeEach(() => {
  localStorage.clear();
  _resetNegotiationForTests();
});
afterEach(() => setRefreshExecutor(null));

describe("connectIdentity", () => {
  it("returns version-mismatch when the server only offers unsupported versions", async () => {
    server.use(http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v99"] })));
    const outcome = await connectIdentity(createFakePlatformBridge(), "p1", identity);
    expect(outcome).toMatchObject({ status: "version-mismatch", direction: "server-newer" });
  });

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

describe("resolveServerQuiet", () => {
  it("resolves ServerInfo without writing the global serverInfo store", async () => {
    stubServer();
    const before = getServerInfo();
    const info = await resolveServerQuiet(ORIGIN);
    expect(info).toMatchObject({ apiUrl: `${ORIGIN}/api`, name: "Srv" });
    expect(getServerInfo()).toBe(before);
  });

  it("throws VersionMismatchError when the server only offers unsupported versions", async () => {
    server.use(http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v99"] })));
    await expect(resolveServerQuiet(ORIGIN)).rejects.toMatchObject({ direction: "server-newer" });
  });

  it("does not repoint the active api version origin", async () => {
    const OTHER_ORIGIN = "https://other.example";
    server.use(
      http.get(`${OTHER_ORIGIN}/api/versions`, () =>
        HttpResponse.json({ versions: ["v1"], features: { voice: ["v1"] } }),
      ),
    );
    stubServer();
    await negotiateApiVersion(OTHER_ORIGIN);
    await resolveServerQuiet(ORIGIN);
    expect(supportsFeature("voice")).toBe(true);
  });
});
