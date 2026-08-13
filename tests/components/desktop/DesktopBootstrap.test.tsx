import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { DesktopBootstrap } from "@/desktop/DesktopBootstrap";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import {
  addIdentity,
  createDefaultConfig,
  loadDesktopConfig,
  saveDesktopConfig,
  secretKey,
  setLastActiveIdentity,
} from "@/desktop/desktopConfig";
import { getAccessToken, setAccessToken } from "@/api/tokenStore";

const ORIGIN = "https://srv.example";

function stubHealthyServer() {
  server.use(
    http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    http.get(`${ORIGIN}/api/v1/server-info`, () =>
      HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "Srv" }),
    ),
    http.post(`${ORIGIN}/api/token/refresh`, () =>
      HttpResponse.json({ token: "jwt-live", refresh_token: "r2" }),
    ),
  );
}

describe("DesktopBootstrap", () => {
  beforeEach(() => {
    localStorage.clear();
    setAccessToken(null);
    setPlatformBridgeForTests(createFakePlatformBridge());
  });

  it("shows the wizard on first run (no identities)", async () => {
    render(
      <DesktopBootstrap>
        <div data-testid="app" />
      </DesktopBootstrap>,
    );
    expect(await screen.findByTestId("wizard-server-input")).toBeInTheDocument();
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
  });

  it("auto-connects the last identity and renders the app", async () => {
    stubHealthyServer();
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    let cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    cfg = addIdentity(cfg, pid, {
      id: "i1",
      serverUrl: ORIGIN,
      email: "a@b.c",
      userId: null,
      displayName: null,
    });
    cfg = setLastActiveIdentity(cfg, pid, "i1");
    await saveDesktopConfig(bridge, cfg);
    await bridge.secrets.set(secretKey(pid, "i1", "refreshToken"), "r1");

    render(
      <DesktopBootstrap>
        <div data-testid="app" />
      </DesktopBootstrap>,
    );
    expect(await screen.findByTestId("app")).toBeInTheDocument();
    expect(getAccessToken()).toBe("jwt-live");
  });

  it("falls to the locked re-login wizard when the refresh token is rejected", async () => {
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
      http.get(`${ORIGIN}/api/v1/server-info`, () =>
        HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "Srv" }),
      ),
      http.post(`${ORIGIN}/api/token/refresh`, () =>
        HttpResponse.json({ error: "x" }, { status: 401 }),
      ),
    );
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    let cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    cfg = addIdentity(cfg, pid, {
      id: "i1",
      serverUrl: ORIGIN,
      email: "a@b.c",
      userId: null,
      displayName: null,
    });
    cfg = setLastActiveIdentity(cfg, pid, "i1");
    await saveDesktopConfig(bridge, cfg);
    await bridge.secrets.set(secretKey(pid, "i1", "refreshToken"), "dead");

    render(
      <DesktopBootstrap>
        <div data-testid="app" />
      </DesktopBootstrap>,
    );
    expect(await screen.findByTestId("wizard-password-input")).toBeInTheDocument();
  });

  it("overwrites the stored email when re-login uses a different account for the same server", async () => {
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
      http.get(`${ORIGIN}/api/v1/server-info`, () =>
        HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "Srv" }),
      ),
      http.post(`${ORIGIN}/api/token/refresh`, () =>
        HttpResponse.json({ error: "x" }, { status: 401 }),
      ),
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ token: "jwt-new", refresh_token: "refresh-new" }),
      ),
    );
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    let cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    cfg = addIdentity(cfg, pid, {
      id: "i1",
      serverUrl: ORIGIN,
      email: "a@b.c",
      userId: null,
      displayName: null,
    });
    cfg = setLastActiveIdentity(cfg, pid, "i1");
    await saveDesktopConfig(bridge, cfg);
    await bridge.secrets.set(secretKey(pid, "i1", "refreshToken"), "dead");

    const user = userEvent.setup();
    render(
      <DesktopBootstrap>
        <div data-testid="app" />
      </DesktopBootstrap>,
    );

    const emailInput = await screen.findByTestId("wizard-email-input");
    await user.clear(emailInput);
    await user.type(emailInput, "b@c.d");
    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    expect(await screen.findByTestId("app")).toBeInTheDocument();

    const finalConfig = await loadDesktopConfig(bridge);
    const profile = finalConfig.profiles.find((p) => p.id === pid)!;
    expect(profile.identities).toHaveLength(1);
    expect(profile.identities[0]).toMatchObject({
      id: "i1",
      serverUrl: ORIGIN,
      email: "b@c.d",
    });
  });
});
