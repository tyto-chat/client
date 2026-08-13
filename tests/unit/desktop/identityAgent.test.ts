import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { IdentityAgent } from "@/desktop/agents/IdentityAgent";
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

describe("IdentityAgent", () => {
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
    const agent = new IdentityAgent(bridge, PROFILE_ID, makeIdentity(), callbacks);

    agent.start();
    await vi.waitFor(() => expect(agent.getSnapshot().status).toBe("healthy"));

    expect(agent.getAccessToken()).not.toBeNull();
    expect(callbacks.persistRotatedToken).toHaveBeenCalledWith("rotated");
    expect(agent.getSnapshot()).toMatchObject({
      identityId: IDENTITY_ID,
      status: "healthy",
      serverName: "Srv",
      origin: ORIGIN,
      communities: [],
      unreadCounts: {},
    });
    expect(callbacks.onChange).toHaveBeenLastCalledWith(agent.getSnapshot());

    agent.stop();
  });

  it("captures each agent's own negotiated api version even when negotiations interleave", async () => {
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
    const agentA = new IdentityAgent(
      bridge,
      PROFILE_ID,
      makeIdentity({ id: "ia", serverUrl: ORIGIN_A }),
      makeCallbacks(),
    );
    const agentB = new IdentityAgent(
      bridge,
      PROFILE_ID,
      makeIdentity({ id: "ib", serverUrl: ORIGIN_B }),
      makeCallbacks(),
    );

    agentA.start();
    await vi.waitFor(() => expect(agentA.getSnapshot().status).toBe("connecting"));

    agentB.start();
    await vi.waitFor(() => expect(agentB.serverInfo()).not.toBeNull());
    expect(agentB.serverContext().apiVersion).toBe(getApiVersionForOrigin(ORIGIN_B));

    releaseA();
    await vi.waitFor(() => expect(agentA.serverInfo()).not.toBeNull());
    expect(agentA.serverContext().apiVersion).toBe(getApiVersionForOrigin(ORIGIN_A));

    expect(spy).toHaveBeenCalledWith(ORIGIN_A);
    expect(spy).toHaveBeenCalledWith(ORIGIN_B);

    agentA.stop();
    agentB.stop();
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
    const agent = new IdentityAgent(bridge, PROFILE_ID, makeIdentity(), callbacks);

    agent.start();
    await vi.waitFor(() => expect(agent.getSnapshot().status).toBe("healthy"));

    expect(callbacks.persistRotatedToken).toHaveBeenCalledWith("new-refresh");
    expect(agent.getAccessToken()).not.toBeNull();

    agent.stop();
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
    const agent = new IdentityAgent(bridge, PROFILE_ID, makeIdentity(), callbacks);

    agent.start();
    await vi.waitFor(() => expect(agent.getSnapshot().status).toBe("auth-failed"));

    expect(agent.getAccessToken()).toBeNull();
    expect(callbacks.persistRotatedToken).not.toHaveBeenCalled();

    agent.stop();
  });

  it("flags auth-failed when neither a refresh token nor a password secret is stored", async () => {
    stubServerInfo();
    const bridge = createFakePlatformBridge();
    const callbacks = makeCallbacks();
    const agent = new IdentityAgent(bridge, PROFILE_ID, makeIdentity(), callbacks);

    agent.start();
    await vi.waitFor(() => expect(agent.getSnapshot().status).toBe("auth-failed"));

    agent.stop();
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
    const agent = new IdentityAgent(bridge, PROFILE_ID, makeIdentity(), callbacks);

    agent.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(agent.getSnapshot().status).toBe("unreachable");
    expect(versionsHits).toBe(1);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(versionsHits).toBe(2);
    expect(agent.getSnapshot().status).toBe("unreachable");

    agent.stop();
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
    const agent = new IdentityAgent(bridge, PROFILE_ID, makeIdentity(), callbacks);

    agent.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(agent.getSnapshot().status).toBe("version-mismatch");
    expect(versionsHits).toBe(1);

    await vi.advanceTimersByTimeAsync(600_000);
    expect(versionsHits).toBe(1);
    expect(agent.getSnapshot().status).toBe("version-mismatch");

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
    agent.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(agent.getSnapshot().status).toBe("healthy");

    agent.stop();
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
    const agent = new IdentityAgent(bridge, PROFILE_ID, makeIdentity(), callbacks);

    agent.start();
    await vi.waitFor(() => expect(agent.getSnapshot().status).toBe("healthy"));
    expect(refreshHits).toBe(1);

    const [a, b] = await Promise.all([agent.refreshNow(), agent.refreshNow()]);
    expect(a).toBe(b);
    expect(refreshHits).toBe(2);

    agent.stop();
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
    const agent = new IdentityAgent(bridge, PROFILE_ID, makeIdentity(), callbacks);

    agent.start();
    await vi.waitFor(() => expect(agent.getSnapshot().status).toBe("auth-failed"));

    await expect(agent.refreshNow()).rejects.toThrow();
    expect(agent.getSnapshot().status).toBe("auth-failed");

    agent.stop();
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
    const agent = new IdentityAgent(bridge, PROFILE_ID, makeIdentity(), callbacks);

    agent.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(agent.getSnapshot().status).toBe("unreachable");
    expect(versionsHits).toBe(1);

    agent.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(versionsHits).toBe(1);
  });
});
