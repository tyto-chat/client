import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { GuestConnection } from "@/desktop/connections/GuestConnection";
import { IdentityConnection } from "@/desktop/connections/IdentityConnection";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { secretKey, type DesktopIdentity } from "@/desktop/desktopConfig";
import { _resetNegotiationForTests } from "@/api/apiVersion";

const ORIGIN = "https://guest.example";
const PROFILE_ID = "p1";
const IDENTITY_ID = "g1";

function makeIdentity(overrides: Partial<DesktopIdentity> = {}): DesktopIdentity {
  return {
    id: IDENTITY_ID,
    serverUrl: ORIGIN,
    email: "",
    userId: null,
    displayName: null,
    kind: "guest",
    ...overrides,
  };
}

function stubServerInfo() {
  server.use(
    http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    http.get(`${ORIGIN}/api/v1/server-info`, () =>
      HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "Guest Srv" }),
    ),
  );
}

function community(id: number, identifier: string) {
  return {
    "@id": `/api/v1/communities/${identifier}`,
    id,
    identifier,
    name: identifier.toUpperCase(),
    logo: null,
    accentColor: null,
    isPrivate: false,
  };
}

beforeEach(() => {
  localStorage.clear();
  _resetNegotiationForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GuestConnection", () => {
  it("loads public communities without credentials and reports healthy", async () => {
    stubServerInfo();
    let authHeader: string | null = "unset";
    server.use(
      http.get(`${ORIGIN}/api/v1/communities`, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json({ "hydra:member": [community(1, "public-a")] });
      }),
    );
    const onChange = vi.fn();
    const connection = new GuestConnection(makeIdentity(), { onChange });

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().status).toBe("healthy"));

    expect(authHeader).toBeNull();
    expect(connection.getSnapshot()).toMatchObject({
      identityId: IDENTITY_ID,
      kind: "guest",
      status: "healthy",
      serverName: "Guest Srv",
      origin: ORIGIN,
      userId: null,
      unreadCounts: {},
      conversationActivityAt: null,
    });
    expect(connection.getSnapshot().communities).toEqual([
      expect.objectContaining({ id: 1, identifier: "public-a", member: false, pinned: false }),
    ]);
    expect(connection.railSeed()).toMatchObject({ pinned: [], memberships: [] });
    expect(onChange).toHaveBeenLastCalledWith(connection.getSnapshot());

    connection.stop();
  });

  it("exposes no access token", async () => {
    stubServerInfo();
    server.use(
      http.get(`${ORIGIN}/api/v1/communities`, () => HttpResponse.json({ "hydra:member": [] })),
    );
    const connection = new GuestConnection(makeIdentity(), { onChange: vi.fn() });

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().status).toBe("healthy"));

    expect(connection.getAccessToken()).toBeNull();
    expect(connection.serverContext().getToken()).toBeNull();

    connection.stop();
  });

  it("goes unreachable on a server error and retries with backoff", async () => {
    vi.useFakeTimers();
    stubServerInfo();
    let hits = 0;
    server.use(
      http.get(`${ORIGIN}/api/v1/communities`, () => {
        hits += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const connection = new GuestConnection(makeIdentity(), { onChange: vi.fn() });

    connection.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.getSnapshot().status).toBe("unreachable");
    expect(hits).toBe(1);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(hits).toBe(2);
    expect(connection.getSnapshot().status).toBe("unreachable");

    connection.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(hits).toBe(2);
  });

  it("never reports auth-failed when the server rejects the anonymous read", async () => {
    stubServerInfo();
    server.use(
      http.get(`${ORIGIN}/api/v1/communities`, () =>
        HttpResponse.json({ error: "denied" }, { status: 401 }),
      ),
    );
    const connection = new GuestConnection(makeIdentity(), { onChange: vi.fn() });

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().status).toBe("unreachable"));

    connection.stop();
  });

  it("reports version-mismatch without scheduling a retry, and recovers via retry()", async () => {
    vi.useFakeTimers();
    let versionsHits = 0;
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => {
        versionsHits += 1;
        return HttpResponse.json({ versions: ["v99"] });
      }),
    );
    const connection = new GuestConnection(makeIdentity(), { onChange: vi.fn() });

    connection.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.getSnapshot().status).toBe("version-mismatch");

    await vi.advanceTimersByTimeAsync(600_000);
    expect(versionsHits).toBe(1);

    server.use(
      http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
      http.get(`${ORIGIN}/api/v1/server-info`, () =>
        HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "Guest Srv" }),
      ),
      http.get(`${ORIGIN}/api/v1/communities`, () => HttpResponse.json({ "hydra:member": [] })),
    );
    connection.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.getSnapshot().status).toBe("healthy");

    connection.stop();
  });

  it("refreshRailData reloads the public community list", async () => {
    stubServerInfo();
    let payload = [community(1, "public-a")];
    server.use(
      http.get(`${ORIGIN}/api/v1/communities`, () =>
        HttpResponse.json({ "hydra:member": payload }),
      ),
    );
    const connection = new GuestConnection(makeIdentity(), { onChange: vi.fn() });

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().communities).toHaveLength(1));

    payload = [community(1, "public-a"), community(2, "public-b")];
    await connection.refreshRailData();

    expect(connection.getSnapshot().communities).toHaveLength(2);

    connection.stop();
  });
});

describe("ConnectionSnapshot kind", () => {
  it("stamps identity on an IdentityConnection snapshot", async () => {
    const IDENTITY_ORIGIN = "https://srv-kind.example";
    server.use(
      http.get(`${IDENTITY_ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
      http.get(`${IDENTITY_ORIGIN}/api/v1/server-info`, () =>
        HttpResponse.json({ apiUrl: `${IDENTITY_ORIGIN}/api`, name: "Srv" }),
      ),
      http.post(`${IDENTITY_ORIGIN}/api/token/refresh`, () =>
        HttpResponse.json({ error: "invalid" }, { status: 401 }),
      ),
    );
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, "i1", "refreshToken"), "dead");
    const connection = new IdentityConnection(
      bridge,
      PROFILE_ID,
      makeIdentity({ id: "i1", serverUrl: IDENTITY_ORIGIN, kind: "identity" }),
      { onChange: vi.fn(), onNotification: vi.fn(), persistRotatedToken: vi.fn(async () => {}) },
    );

    expect(connection.getSnapshot().kind).toBe("identity");

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().status).toBe("auth-failed"));
    expect(connection.getSnapshot().kind).toBe("identity");

    connection.stop();
  });
});
