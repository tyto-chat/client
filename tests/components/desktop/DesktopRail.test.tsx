import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { AddServerModal, DesktopRailGroups } from "@/desktop/DesktopRail";
import { ReloginModal } from "@/desktop/ReloginModal";
import {
  ConnectionsContext,
  type ConnectionsContextValue,
} from "@/desktop/connections/ConnectionsContext";
import { ConnectionRegistry as RealConnectionRegistry } from "@/desktop/connections/ConnectionRegistry";
import type {
  ConnectionRegistry,
  RegistrySnapshot,
} from "@/desktop/connections/ConnectionRegistry";
import type {
  ConnectionSnapshot,
  IdentityConnection,
} from "@/desktop/connections/IdentityConnection";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import {
  addIdentity,
  createDefaultConfig,
  loadDesktopConfig,
  saveDesktopConfig,
  secretKey,
  setLastActiveIdentity,
  type DesktopIdentity,
} from "@/desktop/desktopConfig";
import { _resetNegotiationForTests } from "@/api/apiVersion";
import { __resetRefreshStateForTests, refreshAccessToken } from "@/api/auth";
import { setAccessToken } from "@/api/tokenStore";

function makeToken(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(JSON.stringify({ exp }));
  return `${header}.${payload}.sig`;
}

function farFutureToken(): string {
  return makeToken(Math.floor(Date.now() / 1000) + 3600);
}

function stubOriginFull(
  origin: string,
  name: string,
  userId: number,
  refreshCounter: { count: number },
) {
  server.use(
    http.get(`${origin}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    http.get(`${origin}/api/v1/server-info`, () =>
      HttpResponse.json({ apiUrl: `${origin}/api`, name }),
    ),
    http.post(`${origin}/api/token/refresh`, () => {
      refreshCounter.count += 1;
      return HttpResponse.json({ token: farFutureToken(), refresh_token: `rotated-${name}` });
    }),
    http.get(`${origin}/api/v1/me`, () => HttpResponse.json({ id: userId })),
    http.get(`${origin}/api/v1/me/community-memberships`, () =>
      HttpResponse.json({ "hydra:member": [] }),
    ),
    http.get(`${origin}/api/v1/me/pinned-communities`, () =>
      HttpResponse.json({ "hydra:member": [] }),
    ),
    http.get(`${origin}/api/v1/communities`, () => HttpResponse.json({ "hydra:member": [] })),
    http.get(`${origin}/api/v1/notifications/unread-counts`, () =>
      HttpResponse.json({ counts: {} }),
    ),
    http.get(`${origin}/api/v1/realtime/token`, () =>
      HttpResponse.json({ token: `rt-${name}`, expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
    ),
  );
}

function makeConnection(overrides: Partial<ConnectionSnapshot>): ConnectionSnapshot {
  return {
    identityId: "ia",
    status: "healthy",
    serverName: "Alpha",
    origin: "https://a.example",
    userId: 1,
    communities: [],
    unreadCounts: {},
    error: null,
    ...overrides,
  };
}

function makeRegistryStub(
  snapshot: RegistrySnapshot,
  overrides?: Partial<Pick<ConnectionRegistry, "getConnection" | "addIdentity">>,
): ConnectionRegistry {
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getConnection: overrides?.getConnection ?? vi.fn(() => undefined),
    addIdentity: overrides?.addIdentity ?? vi.fn(),
  } as unknown as ConnectionRegistry;
}

function makeConnectionHandle(retry: () => void): IdentityConnection {
  return { retry } as unknown as IdentityConnection;
}

function makeLiveRegistryStub(options?: { neverHealthy?: boolean }): ConnectionRegistry {
  let connections: ConnectionSnapshot[] = [];
  const listeners = new Set<() => void>();
  function notify() {
    for (const listener of Array.from(listeners)) listener();
  }
  return {
    getSnapshot: () => ({ connections, activeIdentityId: null }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getConnection: vi.fn(() => undefined),
    addIdentity: vi.fn((identity: DesktopIdentity) => {
      connections = [
        ...connections,
        makeConnection({
          identityId: identity.id,
          origin: identity.serverUrl,
          status: "connecting",
        }),
      ];
      notify();
      if (!options?.neverHealthy) {
        setTimeout(() => {
          connections = connections.map((a) =>
            a.identityId === identity.id ? { ...a, status: "healthy" } : a,
          );
          notify();
        }, 0);
      }
    }),
  } as unknown as ConnectionRegistry;
}

function renderWithContext(
  ui: React.ReactElement,
  {
    registry,
    switchTo,
  }: { registry: ConnectionRegistry; switchTo?: ConnectionsContextValue["switchTo"] },
) {
  const contextValue: ConnectionsContextValue = {
    registry,
    switchTo: switchTo ?? vi.fn().mockResolvedValue(undefined),
  };
  return render(
    <ConnectionsContext.Provider value={contextValue}>{ui}</ConnectionsContext.Provider>,
  );
}

describe("DesktopRail", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("renders a group header for the active identity", () => {
    const active = makeConnection({ identityId: "ia", serverName: "Alpha" });
    const snapshot: RegistrySnapshot = { connections: [active], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(<DesktopRailGroups />, { registry });

    const headers = screen.getAllByTestId("desktop-server-header");
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveAccessibleName("Alpha");
  });

  it("captions the group with a middle-ellipsized host when the server has no name", () => {
    const active = makeConnection({
      identityId: "ia",
      serverName: null,
      origin: "https://chat.acme-corp.example.com",
    });
    const snapshot: RegistrySnapshot = { connections: [active], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(<DesktopRailGroups />, { registry });

    const header = screen.getByTestId("desktop-server-header");
    expect(within(header).getByText("chat.acme…le.com")).toBeInTheDocument();
    expect(header).toHaveAttribute("title", "https://chat.acme-corp.example.com");
  });

  it("lists the non-active group's communities with unread badges and does not repeat the active group", () => {
    const active = makeConnection({ identityId: "ia", serverName: "Alpha" });
    const other = makeConnection({
      identityId: "ib",
      serverName: "Beta",
      communities: [
        {
          id: 10,
          identifier: "sw",
          name: "Software",
          logoUrl: null,
          accentColor: "#3b82f6",
          iri: null,
          member: true,
          pinned: true,
        },
        {
          id: 11,
          identifier: "gm",
          name: "Games",
          logoUrl: null,
          accentColor: null,
          iri: null,
          member: true,
          pinned: true,
        },
      ],
      unreadCounts: { "10": 3, "11": 0, dm: 2 },
    });
    const snapshot: RegistrySnapshot = { connections: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(<DesktopRailGroups />, { registry });

    const headers = screen.getAllByTestId("desktop-server-header");
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveAccessibleName("Alpha");
    expect(headers[1]).toHaveAccessibleName("Beta");

    const tiles = screen.getAllByTestId("desktop-rail-community");
    expect(tiles).toHaveLength(2);
    expect(tiles.map((t) => t.getAttribute("title"))).toEqual(["Software", "Games"]);

    const swTileWrapper = tiles[0]!.parentElement!;
    expect(within(swTileWrapper).getByText("3")).toBeInTheDocument();

    const gmTileWrapper = tiles[1]!.parentElement!;
    expect(within(gmTileWrapper).queryByText("0")).not.toBeInTheDocument();

    expect(screen.getByTestId("desktop-server-header-dm")).toBeInTheDocument();
  });

  it("keeps registry order when the active identity is not first — active well moves, groups do not", () => {
    const first = makeConnection({
      identityId: "ia",
      serverName: "Alpha",
      communities: [
        {
          id: 10,
          identifier: "sw",
          name: "Software",
          logoUrl: null,
          accentColor: null,
          iri: null,
          member: true,
          pinned: true,
        },
      ],
    });
    const second = makeConnection({ identityId: "ib", serverName: "Beta" });
    const snapshot: RegistrySnapshot = { connections: [first, second], activeIdentityId: "ib" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(
      <DesktopRailGroups>
        <span data-testid="active-children" />
      </DesktopRailGroups>,
      { registry },
    );

    const headers = screen.getAllByTestId("desktop-server-header");
    expect(headers.map((h) => h.getAttribute("aria-label"))).toEqual(["Alpha", "Beta"]);

    const activeWell = screen.getByTestId("desktop-active-group");
    expect(within(activeWell).getByTestId("active-children")).toBeInTheDocument();
    expect(within(activeWell).queryByTestId("desktop-rail-community")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("desktop-rail-community")).toHaveLength(1);
  });

  it("mirrors the rail overflow rule in inactive wells: pinned tiles, single unpinned as tile, several as +N", async () => {
    const mk = (id: number, name: string, pinned: boolean) => ({
      id,
      identifier: name.toLowerCase(),
      name,
      logoUrl: null,
      accentColor: null,
      iri: null,
      member: true,
      pinned,
    });
    const active = makeConnection({ identityId: "ia", serverName: "Alpha" });
    const other = makeConnection({
      identityId: "ib",
      serverName: "Beta",
      communities: [
        mk(1, "Pin1", true),
        mk(2, "Pin2", true),
        mk(3, "Ov1", false),
        mk(4, "Ov2", false),
      ],
      unreadCounts: { "3": 2, "4": 1 },
    });
    const snapshot: RegistrySnapshot = { connections: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);
    const switchTo = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithContext(<DesktopRailGroups />, { registry, switchTo });

    const tiles = screen.getAllByTestId("desktop-rail-community");
    expect(tiles.map((tile) => tile.getAttribute("title"))).toEqual(["Pin1", "Pin2"]);
    const overflowTile = screen.getByTestId("desktop-rail-overflow");
    expect(overflowTile).toHaveTextContent("+2");
    expect(within(overflowTile.parentElement!).getByText("3")).toBeInTheDocument();

    await user.click(overflowTile);
    expect(switchTo).toHaveBeenCalledWith("ib");
  });

  it("renders a single unpinned community as a real tile, not a +1 badge, in an inactive well", () => {
    const active = makeConnection({ identityId: "ia", serverName: "Alpha" });
    const other = makeConnection({
      identityId: "ib",
      serverName: "Beta",
      communities: [
        {
          id: 3,
          identifier: "solo",
          name: "Solo",
          logoUrl: null,
          accentColor: null,
          iri: null,
          member: true,
          pinned: false,
        },
      ],
    });
    const snapshot: RegistrySnapshot = { connections: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(<DesktopRailGroups />, { registry });

    expect(screen.getByTestId("desktop-rail-community")).toHaveAttribute("title", "Solo");
    expect(screen.queryByTestId("desktop-rail-overflow")).not.toBeInTheDocument();
  });

  it("fires switchTo with the right identity + navigate target when a community tile is clicked", async () => {
    const user = userEvent.setup();
    const active = makeConnection({ identityId: "ia" });
    const other = makeConnection({
      identityId: "ib",
      serverName: "Beta",
      communities: [
        {
          id: 10,
          identifier: "sw",
          name: "Software",
          logoUrl: null,
          accentColor: null,
          iri: null,
          member: true,
          pinned: true,
        },
      ],
    });
    const snapshot: RegistrySnapshot = { connections: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);
    const switchTo = vi.fn().mockResolvedValue(undefined);

    renderWithContext(<DesktopRailGroups />, { registry, switchTo });

    await user.click(screen.getByTestId("desktop-rail-community"));

    expect(switchTo).toHaveBeenCalledWith("ib", {
      to: "/$communityId",
      params: { communityId: "sw" },
    });
  });

  it("disables community tiles for a non-healthy connection and fires nothing on click", async () => {
    const user = userEvent.setup();
    const active = makeConnection({ identityId: "ia" });
    const other = makeConnection({
      identityId: "ib",
      serverName: "Beta",
      status: "unreachable",
      communities: [
        {
          id: 10,
          identifier: "sw",
          name: "Software",
          logoUrl: null,
          accentColor: null,
          iri: null,
          member: true,
          pinned: true,
        },
      ],
    });
    const snapshot: RegistrySnapshot = { connections: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);
    const switchTo = vi.fn().mockResolvedValue(undefined);

    renderWithContext(<DesktopRailGroups />, { registry, switchTo });

    const tile = screen.getByTestId("desktop-rail-community");
    expect(tile).toBeDisabled();
    expect(tile).toHaveAttribute("aria-disabled", "true");
    expect(tile.className).toContain("opacity-40");
    expect(tile.className).toContain("pointer-events-none");

    await user.click(tile);

    expect(switchTo).not.toHaveBeenCalled();
  });

  it("opens the add-server modal onto the wizard's server step when the + tile is clicked", async () => {
    const user = userEvent.setup();
    const active = makeConnection({ identityId: "ia" });
    const snapshot: RegistrySnapshot = { connections: [active], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(<DesktopRailGroups />, { registry });

    expect(screen.queryByTestId("wizard-server-input")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("desktop-add-server"));

    expect(await screen.findByTestId("wizard-server-input")).toBeInTheDocument();
  });

  it("renders null for both rail sections in web mode even inside a provider", () => {
    vi.stubEnv("VITE_APP_MODE", "");
    const active = makeConnection({ identityId: "ia" });
    const snapshot: RegistrySnapshot = { connections: [active], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    const { container } = renderWithContext(
      <>
        <DesktopRailGroups />
        <DesktopRailGroups />
      </>,
      { registry },
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders null for both rail sections outside ConnectionsContext, even in desktop mode", () => {
    const { container } = render(
      <>
        <DesktopRailGroups />
        <DesktopRailGroups />
      </>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("AddServerModal persists the wizard result, registers the connection, and switches to it once it becomes healthy", async () => {
    const ORIGIN = "https://new.example";
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
      http.get(`${ORIGIN}/api/v1/server-info`, () =>
        HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "NewServer" }),
      ),
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ token: "jwt-new", refresh_token: "refresh-new" }),
      ),
    );
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await saveDesktopConfig(bridge, createDefaultConfig());

    const registry = makeLiveRegistryStub();
    const addIdentitySpy = vi.spyOn(registry, "addIdentity");
    const switchTo = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<AddServerModal registry={registry} switchTo={switchTo} onClose={onClose} />);

    await user.type(screen.getByTestId("wizard-server-input"), "new.example");
    await user.click(screen.getByTestId("wizard-server-submit"));
    await user.type(await screen.findByTestId("wizard-email-input"), "a@b.c");
    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    expect(addIdentitySpy).toHaveBeenCalledTimes(1);
    const addedIdentity = addIdentitySpy.mock.calls[0]![0];
    expect(addedIdentity.serverUrl).toBe(ORIGIN);
    expect(addedIdentity.email).toBe("a@b.c");

    await waitFor(() => expect(switchTo).toHaveBeenCalledWith(addedIdentity.id));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    setPlatformBridgeForTests(null);
  });

  it("AddServerModal closes without switching when the new connection never becomes healthy before the timeout", async () => {
    const ORIGIN = "https://stuck.example";
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
      http.get(`${ORIGIN}/api/v1/server-info`, () =>
        HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "StuckServer" }),
      ),
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ token: "jwt-stuck", refresh_token: "refresh-stuck" }),
      ),
    );
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    let cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    cfg = addIdentity(cfg, pid, {
      id: "ia",
      serverUrl: "https://already-active.example",
      email: "active@b.c",
      userId: null,
      displayName: null,
    });
    cfg = setLastActiveIdentity(cfg, pid, "ia");
    await saveDesktopConfig(bridge, cfg);

    const registry = makeLiveRegistryStub({ neverHealthy: true });
    const switchTo = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <AddServerModal
        registry={registry}
        switchTo={switchTo}
        onClose={onClose}
        healthyTimeoutMs={30}
      />,
    );

    await user.type(screen.getByTestId("wizard-server-input"), "stuck.example");
    await user.click(screen.getByTestId("wizard-server-submit"));
    await user.type(await screen.findByTestId("wizard-email-input"), "a@b.c");
    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(switchTo).not.toHaveBeenCalled();

    const persisted = await loadDesktopConfig(bridge);
    const persistedProfile = persisted.profiles.find((p) => p.id === pid);
    expect(persistedProfile?.lastActiveIdentityId).toBe("ia");

    setPlatformBridgeForTests(null);
  });

  it("keeps the global refresh executor pointed at the ACTIVE connection through the AddServerModal flow", async () => {
    _resetNegotiationForTests();
    __resetRefreshStateForTests();
    setAccessToken(null);

    const ORIGIN_A = "https://addserver-exec-active.example";
    const ORIGIN_NEW = "https://addserver-exec-new.example";
    const refreshCounterA = { count: 0 };
    const refreshCounterNew = { count: 0 };
    stubOriginFull(ORIGIN_A, "Active", 1, refreshCounterA);
    stubOriginFull(ORIGIN_NEW, "New", 2, refreshCounterNew);
    server.use(
      http.post(`${ORIGIN_NEW}/api/auth`, () =>
        HttpResponse.json({ token: "jwt-new", refresh_token: "refresh-new" }),
      ),
    );

    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);

    let cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    cfg = addIdentity(cfg, pid, {
      id: "ia",
      serverUrl: ORIGIN_A,
      email: "active@b.c",
      userId: null,
      displayName: null,
    });
    cfg = setLastActiveIdentity(cfg, pid, "ia");
    await saveDesktopConfig(bridge, cfg);
    await bridge.secrets.set(secretKey(pid, "ia", "refreshToken"), "old-a");

    const registry = new RealConnectionRegistry(bridge);
    await registry.boot(
      pid,
      [{ id: "ia", serverUrl: ORIGIN_A, email: "active@b.c", userId: null, displayName: null }],
      "ia",
    );
    await vi.waitFor(() => expect(registry.getSnapshot().connections[0]?.status).toBe("healthy"));

    const switchTo = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<AddServerModal registry={registry} switchTo={switchTo} onClose={onClose} />);

    await user.type(screen.getByTestId("wizard-server-input"), "addserver-exec-new.example");
    await user.click(screen.getByTestId("wizard-server-submit"));
    await user.type(await screen.findByTestId("wizard-email-input"), "a@b.c");
    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    const hitsBeforeA = refreshCounterA.count;
    const hitsBeforeNew = refreshCounterNew.count;
    setAccessToken("stale");
    const refreshed = await refreshAccessToken();

    expect(refreshCounterA.count).toBe(hitsBeforeA + 1);
    expect(refreshCounterNew.count).toBe(hitsBeforeNew);
    expect(refreshed).not.toBe("stale");

    registry.stopAll();
    setPlatformBridgeForTests(null);
  });

  it("shows a lock overlay for an auth-failed connection, opens the relogin wizard prefilled with its email, and retries the identity on completion", async () => {
    const ORIGIN = "https://relogin.example";
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
      http.get(`${ORIGIN}/api/v1/server-info`, () =>
        HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "ReloginServer" }),
      ),
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ token: "jwt-relogin", refresh_token: "refresh-relogin" }),
      ),
    );
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);

    let cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    cfg = addIdentity(cfg, pid, {
      id: "ib",
      serverUrl: ORIGIN,
      email: "locked@b.c",
      userId: null,
      displayName: null,
    });
    cfg = setLastActiveIdentity(cfg, pid, "ib");
    await saveDesktopConfig(bridge, cfg);

    const retrySpy = vi.fn();
    const active = makeConnection({ identityId: "ia" });
    const other = makeConnection({
      identityId: "ib",
      serverName: "Relogin",
      origin: ORIGIN,
      status: "auth-failed",
    });
    const snapshot: RegistrySnapshot = { connections: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot, {
      getConnection: vi.fn((id: string) =>
        id === "ib" ? makeConnectionHandle(retrySpy) : undefined,
      ),
    });
    const user = userEvent.setup();

    renderWithContext(<DesktopRailGroups />, { registry });

    const lockButton = screen.getByTestId("desktop-server-lock");
    expect(lockButton.className).toContain("text-warning");
    await user.click(lockButton);

    const emailInput = await screen.findByTestId("wizard-email-input");
    expect(emailInput).toHaveValue("locked@b.c");

    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    await waitFor(() => expect(retrySpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByTestId("wizard-password-input")).not.toBeInTheDocument(),
    );

    setPlatformBridgeForTests(null);
  });

  it("restores lastActiveIdentityId to the previously active identity after relogging a BACKGROUND identity", async () => {
    const ORIGIN = "https://relogin-bg.example";
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
      http.get(`${ORIGIN}/api/v1/server-info`, () =>
        HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "ReloginServer" }),
      ),
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ token: "jwt-relogin-bg", refresh_token: "refresh-relogin-bg" }),
      ),
    );
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);

    let cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    cfg = addIdentity(cfg, pid, {
      id: "ia",
      serverUrl: "https://active.example",
      email: "active@b.c",
      userId: null,
      displayName: null,
    });
    cfg = addIdentity(cfg, pid, {
      id: "ib",
      serverUrl: ORIGIN,
      email: "locked@b.c",
      userId: null,
      displayName: null,
    });
    cfg = setLastActiveIdentity(cfg, pid, "ia");
    await saveDesktopConfig(bridge, cfg);

    const retrySpy = vi.fn();
    const active = makeConnection({ identityId: "ia" });
    const other = makeConnection({
      identityId: "ib",
      serverName: "Relogin",
      origin: ORIGIN,
      status: "auth-failed",
    });
    const snapshot: RegistrySnapshot = { connections: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot, {
      getConnection: vi.fn((id: string) =>
        id === "ib" ? makeConnectionHandle(retrySpy) : undefined,
      ),
    });
    const user = userEvent.setup();

    renderWithContext(<DesktopRailGroups />, { registry });

    await user.click(screen.getByTestId("desktop-server-lock"));
    await screen.findByTestId("wizard-email-input");
    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    await waitFor(() => expect(retrySpy).toHaveBeenCalledTimes(1));

    const persisted = await loadDesktopConfig(bridge);
    const persistedProfile = persisted.profiles.find((p) => p.id === pid);
    expect(persistedProfile?.lastActiveIdentityId).toBe("ia");

    setPlatformBridgeForTests(null);
  });

  it("keeps the global refresh executor pointed at the ACTIVE connection after relogging a BACKGROUND identity", async () => {
    _resetNegotiationForTests();
    __resetRefreshStateForTests();
    setAccessToken(null);

    const ORIGIN_A = "https://relogin-exec-active.example";
    const ORIGIN_B = "https://relogin-exec-bg.example";
    const refreshCounterA = { count: 0 };
    const refreshCounterB = { count: 0 };
    stubOriginFull(ORIGIN_A, "Active", 1, refreshCounterA);
    stubOriginFull(ORIGIN_B, "Background", 2, refreshCounterB);
    server.use(
      http.post(`${ORIGIN_B}/api/auth`, () =>
        HttpResponse.json({ token: "jwt-relogin-bg", refresh_token: "refresh-relogin-bg" }),
      ),
    );

    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);

    let cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    cfg = addIdentity(cfg, pid, {
      id: "ia",
      serverUrl: ORIGIN_A,
      email: "active@b.c",
      userId: null,
      displayName: null,
    });
    cfg = addIdentity(cfg, pid, {
      id: "ib",
      serverUrl: ORIGIN_B,
      email: "bg@b.c",
      userId: null,
      displayName: null,
    });
    cfg = setLastActiveIdentity(cfg, pid, "ia");
    await saveDesktopConfig(bridge, cfg);
    await bridge.secrets.set(secretKey(pid, "ia", "refreshToken"), "old-a");
    await bridge.secrets.set(secretKey(pid, "ib", "refreshToken"), "old-b");

    const registry = new RealConnectionRegistry(bridge);
    await registry.boot(
      pid,
      [
        { id: "ia", serverUrl: ORIGIN_A, email: "active@b.c", userId: null, displayName: null },
        { id: "ib", serverUrl: ORIGIN_B, email: "bg@b.c", userId: null, displayName: null },
      ],
      "ia",
    );
    await vi.waitFor(() => {
      expect(registry.getSnapshot().connections.map((a) => a.status)).toEqual([
        "healthy",
        "healthy",
      ]);
    });

    const user = userEvent.setup();
    render(<ReloginModal registry={registry} identityId="ib" onClose={() => {}} />);

    await screen.findByTestId("wizard-email-input");
    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    await waitFor(async () => {
      const persisted = await loadDesktopConfig(bridge);
      const profile = persisted.profiles.find((p) => p.id === pid);
      expect(profile?.lastActiveIdentityId).toBe("ia");
    });

    const hitsBeforeA = refreshCounterA.count;
    const hitsBeforeB = refreshCounterB.count;
    setAccessToken("stale");
    const refreshed = await refreshAccessToken();

    expect(refreshCounterA.count).toBe(hitsBeforeA + 1);
    expect(refreshCounterB.count).toBe(hitsBeforeB);
    expect(refreshed).not.toBe("stale");

    registry.stopAll();
    setPlatformBridgeForTests(null);
  });

  it("leaves lastActiveIdentityId unchanged when relogging the ACTIVE identity", async () => {
    const ORIGIN = "https://relogin-active.example";
    server.use(
      http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
      http.get(`${ORIGIN}/api/v1/server-info`, () =>
        HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "ReloginServer" }),
      ),
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({
          token: "jwt-relogin-active",
          refresh_token: "refresh-relogin-active",
        }),
      ),
    );
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);

    let cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    cfg = addIdentity(cfg, pid, {
      id: "ia",
      serverUrl: ORIGIN,
      email: "active@b.c",
      userId: null,
      displayName: null,
    });
    cfg = setLastActiveIdentity(cfg, pid, "ia");
    await saveDesktopConfig(bridge, cfg);

    const retrySpy = vi.fn();
    const active = makeConnection({
      identityId: "ia",
      serverName: "Active",
      origin: ORIGIN,
      status: "auth-failed",
    });
    const snapshot: RegistrySnapshot = { connections: [active], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot, {
      getConnection: vi.fn((id: string) =>
        id === "ia" ? makeConnectionHandle(retrySpy) : undefined,
      ),
    });
    const user = userEvent.setup();

    renderWithContext(<DesktopRailGroups />, { registry });

    await user.click(screen.getByTestId("desktop-server-lock"));
    await screen.findByTestId("wizard-email-input");
    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    await waitFor(() => expect(retrySpy).toHaveBeenCalledTimes(1));

    const persisted = await loadDesktopConfig(bridge);
    const persistedProfile = persisted.profiles.find((p) => p.id === pid);
    expect(persistedProfile?.lastActiveIdentityId).toBe("ia");

    setPlatformBridgeForTests(null);
  });

  it("shows a cloud-off overlay for an unreachable connection and retries immediately on click without opening a modal", async () => {
    const retrySpy = vi.fn();
    const active = makeConnection({ identityId: "ia" });
    const other = makeConnection({ identityId: "ib", serverName: "Beta", status: "unreachable" });
    const snapshot: RegistrySnapshot = { connections: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot, {
      getConnection: vi.fn((id: string) =>
        id === "ib" ? makeConnectionHandle(retrySpy) : undefined,
      ),
    });
    const user = userEvent.setup();

    renderWithContext(<DesktopRailGroups />, { registry });

    const retryButton = screen.getByTestId("desktop-server-retry");
    await user.click(retryButton);

    expect(retrySpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("wizard-email-input")).not.toBeInTheDocument();
  });

  it("shows a version-mismatch warning overlay and a connecting pulse", () => {
    const active = makeConnection({ identityId: "ia" });
    const other = makeConnection({
      identityId: "ib",
      serverName: "Beta",
      status: "version-mismatch",
    });
    const snapshot: RegistrySnapshot = { connections: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(<DesktopRailGroups />, { registry });

    const warning = screen.getByTestId("desktop-server-incompatible");
    expect(warning.className).toContain("text-danger");
  });

  it("applies a pulse animation to a connecting connection's header tile", () => {
    const active = makeConnection({ identityId: "ia" });
    const other = makeConnection({ identityId: "ib", serverName: "Beta", status: "connecting" });
    const snapshot: RegistrySnapshot = { connections: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(<DesktopRailGroups />, { registry });

    const headers = screen.getAllByTestId("desktop-server-header");
    expect(headers[1]!.className).toContain("animate-pulse");
  });
});
