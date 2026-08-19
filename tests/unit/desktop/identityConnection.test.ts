import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { IdentityConnection } from "@/desktop/connections/IdentityConnection";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { secretKey, type DesktopIdentity } from "@/desktop/desktopConfig";
import { _resetNegotiationForTests, getApiVersionForOrigin } from "@/api/apiVersion";
import * as apiVersionModule from "@/api/apiVersion";

const ORIGIN = "https://srv.example";
const PROFILE_ID = "p1";
const IDENTITY_ID = "i1";

function makeIdentity(overrides: Partial<DesktopIdentity> = {}): DesktopIdentity {
  return {
    id: IDENTITY_ID,
    serverUrl: ORIGIN,
    email: "a@b.c",
    userId: null,
    displayName: null,
    ...overrides,
  };
}

function makeToken(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(JSON.stringify({ exp }));
  return `${header}.${payload}.sig`;
}

function farFutureToken(): string {
  return makeToken(Math.floor(Date.now() / 1000) + 3600);
}

function stubServerInfo() {
  server.use(
    http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    http.get(`${ORIGIN}/api/v1/server-info`, () =>
      HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "Srv" }),
    ),
  );
}

function makeCallbacks() {
  return {
    onChange: vi.fn(),
    onNotification: vi.fn(),
    persistRotatedToken: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  localStorage.clear();
  _resetNegotiationForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("IdentityConnection", () => {
  it("refreshes the stored token, persists rotation, and reports healthy", async () => {
    stubServerInfo();
    server.use(
      http.post(`${ORIGIN}/api/token/refresh`, () =>
        HttpResponse.json({ token: farFutureToken(), refresh_token: "rotated" }),
      ),
    );
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "old");
    const callbacks = makeCallbacks();
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), callbacks);

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().status).toBe("healthy"));

    expect(connection.getAccessToken()).not.toBeNull();
    expect(callbacks.persistRotatedToken).toHaveBeenCalledWith("rotated");
    expect(connection.getSnapshot()).toMatchObject({
      identityId: IDENTITY_ID,
      status: "healthy",
      serverName: "Srv",
      origin: ORIGIN,
      communities: [],
      unreadCounts: {},
    });
    expect(callbacks.onChange).toHaveBeenLastCalledWith(connection.getSnapshot());

    connection.stop();
  });

  it("captures each connection's own negotiated api version even when negotiations interleave", async () => {
    const ORIGIN_A = "https://alpha.example";
    const ORIGIN_B = "https://beta.example";
    let releaseA: () => void = () => {};
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    server.use(
      http.get(`${ORIGIN_A}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
      http.get(`${ORIGIN_A}/api/v1/server-info`, async () => {
        await gateA;
        return HttpResponse.json({ apiUrl: `${ORIGIN_A}/api`, name: "A" });
      }),
      http.get(`${ORIGIN_B}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
      http.get(`${ORIGIN_B}/api/v1/server-info`, () =>
        HttpResponse.json({ apiUrl: `${ORIGIN_B}/api`, name: "B" }),
      ),
    );

    const spy = vi.spyOn(apiVersionModule, "getApiVersionForOrigin");
    const bridge = createFakePlatformBridge();
    const connectionA = new IdentityConnection(
      bridge,
      PROFILE_ID,
      makeIdentity({ id: "ia", serverUrl: ORIGIN_A }),
      makeCallbacks(),
    );
    const connectionB = new IdentityConnection(
      bridge,
      PROFILE_ID,
      makeIdentity({ id: "ib", serverUrl: ORIGIN_B }),
      makeCallbacks(),
    );

    connectionA.start();
    await vi.waitFor(() => expect(connectionA.getSnapshot().status).toBe("connecting"));

    connectionB.start();
    await vi.waitFor(() => expect(connectionB.serverInfo()).not.toBeNull());
    expect(connectionB.serverContext().apiVersion).toBe(getApiVersionForOrigin(ORIGIN_B));

    releaseA();
    await vi.waitFor(() => expect(connectionA.serverInfo()).not.toBeNull());
    expect(connectionA.serverContext().apiVersion).toBe(getApiVersionForOrigin(ORIGIN_A));

    expect(spy).toHaveBeenCalledWith(ORIGIN_A);
    expect(spy).toHaveBeenCalledWith(ORIGIN_B);

    connectionA.stop();
    connectionB.stop();
    spy.mockRestore();
  });

  it("falls back to password login when the refresh token is rejected with 401", async () => {
    stubServerInfo();
    server.use(
      http.post(`${ORIGIN}/api/token/refresh`, () =>
        HttpResponse.json({ error: "invalid" }, { status: 401 }),
      ),
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ token: farFutureToken(), refresh_token: "new-refresh" }),
      ),
    );
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "dead");
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "password"), "secret-pw");
    const callbacks = makeCallbacks();
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), callbacks);

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().status).toBe("healthy"));

    expect(callbacks.persistRotatedToken).toHaveBeenCalledWith("new-refresh");
    expect(connection.getAccessToken()).not.toBeNull();

    connection.stop();
  });

  it("flags auth-failed when the password login requires 2FA", async () => {
    stubServerInfo();
    server.use(
      http.post(`${ORIGIN}/api/token/refresh`, () =>
        HttpResponse.json({ error: "invalid" }, { status: 401 }),
      ),
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ token: "pending-2fa-token", twoFactorRequired: true }),
      ),
    );
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "dead");
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "password"), "secret-pw");
    const callbacks = makeCallbacks();
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), callbacks);

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().status).toBe("auth-failed"));

    expect(connection.getAccessToken()).toBeNull();
    expect(callbacks.persistRotatedToken).not.toHaveBeenCalled();

    connection.stop();
  });

  it("flags auth-failed when password login is rejected with 401", async () => {
    stubServerInfo();
    server.use(
      http.post(`${ORIGIN}/api/token/refresh`, () =>
        HttpResponse.json({ error: "invalid" }, { status: 401 }),
      ),
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ error: "invalid" }, { status: 401 }),
      ),
    );
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "dead");
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "password"), "secret-pw");
    const callbacks = makeCallbacks();
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), callbacks);

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().status).toBe("auth-failed"));

    connection.stop();
  });

  it("classifies a 503 from password login as unreachable, not auth-failed, and retries with backoff", async () => {
    vi.useFakeTimers();
    stubServerInfo();
    let authHits = 0;
    server.use(
      http.post(`${ORIGIN}/api/token/refresh`, () =>
        HttpResponse.json({ error: "invalid" }, { status: 401 }),
      ),
      http.post(`${ORIGIN}/api/auth`, () => {
        authHits += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "dead");
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "password"), "secret-pw");
    const callbacks = makeCallbacks();
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), callbacks);

    connection.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.getSnapshot().status).toBe("unreachable");
    expect(authHits).toBe(1);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(authHits).toBe(2);
    expect(connection.getSnapshot().status).toBe("unreachable");

    connection.stop();
  });

  it("flags auth-failed when neither a refresh token nor a password secret is stored", async () => {
    stubServerInfo();
    const bridge = createFakePlatformBridge();
    const callbacks = makeCallbacks();
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), callbacks);

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().status).toBe("auth-failed"));

    connection.stop();
  });

  it("goes unreachable on a network failure and retries with backoff", async () => {
    vi.useFakeTimers();
    let versionsHits = 0;
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => {
        versionsHits += 1;
        return HttpResponse.error();
      }),
    );
    const bridge = createFakePlatformBridge();
    const callbacks = makeCallbacks();
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), callbacks);

    connection.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.getSnapshot().status).toBe("unreachable");
    expect(versionsHits).toBe(1);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(versionsHits).toBe(2);
    expect(connection.getSnapshot().status).toBe("unreachable");

    connection.stop();
  });

  it("stays version-mismatch with no auto-retry, and recovers via retry()", async () => {
    vi.useFakeTimers();
    let versionsHits = 0;
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => {
        versionsHits += 1;
        return HttpResponse.json({ versions: ["v99"] });
      }),
    );
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "old");
    const callbacks = makeCallbacks();
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), callbacks);

    connection.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.getSnapshot().status).toBe("version-mismatch");
    expect(versionsHits).toBe(1);

    await vi.advanceTimersByTimeAsync(600_000);
    expect(versionsHits).toBe(1);
    expect(connection.getSnapshot().status).toBe("version-mismatch");

    server.use(
      http.get(`${ORIGIN}/api/versions`, () => {
        versionsHits += 1;
        return HttpResponse.json({ versions: ["v1"] });
      }),
      http.get(`${ORIGIN}/api/v1/server-info`, () =>
        HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "Srv" }),
      ),
      http.post(`${ORIGIN}/api/token/refresh`, () =>
        HttpResponse.json({ token: farFutureToken(), refresh_token: "rotated" }),
      ),
    );
    connection.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.getSnapshot().status).toBe("healthy");

    connection.stop();
  });

  it("shares a single in-flight refresh across concurrent refreshNow() calls", async () => {
    stubServerInfo();
    let refreshHits = 0;
    server.use(
      http.post(`${ORIGIN}/api/token/refresh`, () => {
        refreshHits += 1;
        return HttpResponse.json({ token: farFutureToken(), refresh_token: "rotated" });
      }),
    );
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "old");
    const callbacks = makeCallbacks();
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), callbacks);

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().status).toBe("healthy"));
    expect(refreshHits).toBe(1);

    const [a, b] = await Promise.all([connection.refreshNow(), connection.refreshNow()]);
    expect(a).toBe(b);
    expect(refreshHits).toBe(2);

    connection.stop();
  });

  it("flips to auth-failed and rejects when refreshNow's fallback has no password", async () => {
    stubServerInfo();
    server.use(
      http.post(`${ORIGIN}/api/token/refresh`, () =>
        HttpResponse.json({ error: "invalid" }, { status: 401 }),
      ),
    );
    const bridge = createFakePlatformBridge();
    await bridge.secrets.set(secretKey(PROFILE_ID, IDENTITY_ID, "refreshToken"), "dead");
    const callbacks = makeCallbacks();
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), callbacks);

    connection.start();
    await vi.waitFor(() => expect(connection.getSnapshot().status).toBe("auth-failed"));

    await expect(connection.refreshNow()).rejects.toThrow();
    expect(connection.getSnapshot().status).toBe("auth-failed");

    connection.stop();
  });

  it("stop() cancels a pending retry timer", async () => {
    vi.useFakeTimers();
    let versionsHits = 0;
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => {
        versionsHits += 1;
        return HttpResponse.error();
      }),
    );
    const bridge = createFakePlatformBridge();
    const callbacks = makeCallbacks();
    const connection = new IdentityConnection(bridge, PROFILE_ID, makeIdentity(), callbacks);

    connection.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.getSnapshot().status).toBe("unreachable");
    expect(versionsHits).toBe(1);

    connection.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(versionsHits).toBe(1);
  });
});
