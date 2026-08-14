import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { AddServerModal, DesktopRailActiveHeader, DesktopRailOthers } from "@/desktop/DesktopRail";
import { AgentsContext, type AgentsContextValue } from "@/desktop/agents/AgentsContext";
import type { AgentRegistry, RegistrySnapshot } from "@/desktop/agents/AgentRegistry";
import type { AgentSnapshot, IdentityAgent } from "@/desktop/agents/IdentityAgent";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import {
  addIdentity,
  createDefaultConfig,
  loadDesktopConfig,
  saveDesktopConfig,
  setLastActiveIdentity,
  type DesktopIdentity,
} from "@/desktop/desktopConfig";

function makeAgent(overrides: Partial<AgentSnapshot>): AgentSnapshot {
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
  overrides?: Partial<Pick<AgentRegistry, "getAgent" | "addIdentity">>,
): AgentRegistry {
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getAgent: overrides?.getAgent ?? vi.fn(() => undefined),
    addIdentity: overrides?.addIdentity ?? vi.fn(),
  } as unknown as AgentRegistry;
}

function makeAgentHandle(retry: () => void): IdentityAgent {
  return { retry } as unknown as IdentityAgent;
}

function makeLiveRegistryStub(options?: { neverHealthy?: boolean }): AgentRegistry {
  let agents: AgentSnapshot[] = [];
  const listeners = new Set<() => void>();
  function notify() {
    for (const listener of Array.from(listeners)) listener();
  }
  return {
    getSnapshot: () => ({ agents, activeIdentityId: null }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getAgent: vi.fn(() => undefined),
    addIdentity: vi.fn((identity: DesktopIdentity) => {
      agents = [
        ...agents,
        makeAgent({ identityId: identity.id, origin: identity.serverUrl, status: "connecting" }),
      ];
      notify();
      if (!options?.neverHealthy) {
        setTimeout(() => {
          agents = agents.map((a) =>
            a.identityId === identity.id ? { ...a, status: "healthy" } : a,
          );
          notify();
        }, 0);
      }
    }),
  } as unknown as AgentRegistry;
}

function renderWithContext(
  ui: React.ReactElement,
  { registry, switchTo }: { registry: AgentRegistry; switchTo?: AgentsContextValue["switchTo"] },
) {
  const contextValue: AgentsContextValue = {
    registry,
    switchTo: switchTo ?? vi.fn().mockResolvedValue(undefined),
  };
  return render(<AgentsContext.Provider value={contextValue}>{ui}</AgentsContext.Provider>);
}

describe("DesktopRail", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("renders a group header for the active identity via DesktopRailActiveHeader", () => {
    const active = makeAgent({ identityId: "ia", serverName: "Alpha" });
    const snapshot: RegistrySnapshot = { agents: [active], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(<DesktopRailActiveHeader />, { registry });

    const headers = screen.getAllByTestId("desktop-server-header");
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveAccessibleName("Alpha");
  });

  it("lists the non-active group's communities with unread badges and does not repeat the active group", () => {
    const active = makeAgent({ identityId: "ia", serverName: "Alpha" });
    const other = makeAgent({
      identityId: "ib",
      serverName: "Beta",
      communities: [
        { id: 10, identifier: "sw", name: "Software", logoUrl: null, accentColor: "#3b82f6" },
        { id: 11, identifier: "gm", name: "Games", logoUrl: null, accentColor: null },
      ],
      unreadCounts: { "10": 3, "11": 0, dm: 2 },
    });
    const snapshot: RegistrySnapshot = { agents: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(<DesktopRailOthers />, { registry });

    const headers = screen.getAllByTestId("desktop-server-header");
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveAccessibleName("Beta");

    const tiles = screen.getAllByTestId("desktop-rail-community");
    expect(tiles).toHaveLength(2);
    expect(tiles.map((t) => t.getAttribute("title"))).toEqual(["Software", "Games"]);

    const swTileWrapper = tiles[0]!.parentElement!;
    expect(within(swTileWrapper).getByText("3")).toBeInTheDocument();

    const gmTileWrapper = tiles[1]!.parentElement!;
    expect(within(gmTileWrapper).queryByText("0")).not.toBeInTheDocument();

    expect(screen.getByTestId("desktop-server-header-dm")).toBeInTheDocument();
  });

  it("fires switchTo with the right identity + navigate target when a community tile is clicked", async () => {
    const user = userEvent.setup();
    const active = makeAgent({ identityId: "ia" });
    const other = makeAgent({
      identityId: "ib",
      serverName: "Beta",
      communities: [
        { id: 10, identifier: "sw", name: "Software", logoUrl: null, accentColor: null },
      ],
    });
    const snapshot: RegistrySnapshot = { agents: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);
    const switchTo = vi.fn().mockResolvedValue(undefined);

    renderWithContext(<DesktopRailOthers />, { registry, switchTo });

    await user.click(screen.getByTestId("desktop-rail-community"));

    expect(switchTo).toHaveBeenCalledWith("ib", {
      to: "/$communityId",
      params: { communityId: "sw" },
    });
  });

  it("disables community tiles for a non-healthy agent and fires nothing on click", async () => {
    const user = userEvent.setup();
    const active = makeAgent({ identityId: "ia" });
    const other = makeAgent({
      identityId: "ib",
      serverName: "Beta",
      status: "unreachable",
      communities: [
        { id: 10, identifier: "sw", name: "Software", logoUrl: null, accentColor: null },
      ],
    });
    const snapshot: RegistrySnapshot = { agents: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);
    const switchTo = vi.fn().mockResolvedValue(undefined);

    renderWithContext(<DesktopRailOthers />, { registry, switchTo });

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
    const active = makeAgent({ identityId: "ia" });
    const snapshot: RegistrySnapshot = { agents: [active], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(<DesktopRailOthers />, { registry });

    expect(screen.queryByTestId("wizard-server-input")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("desktop-add-server"));

    expect(await screen.findByTestId("wizard-server-input")).toBeInTheDocument();
  });

  it("renders null for both rail sections in web mode even inside a provider", () => {
    vi.stubEnv("VITE_APP_MODE", "");
    const active = makeAgent({ identityId: "ia" });
    const snapshot: RegistrySnapshot = { agents: [active], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    const { container } = renderWithContext(
      <>
        <DesktopRailActiveHeader />
        <DesktopRailOthers />
      </>,
      { registry },
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders null for both rail sections outside AgentsContext, even in desktop mode", () => {
    const { container } = render(
      <>
        <DesktopRailActiveHeader />
        <DesktopRailOthers />
      </>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("AddServerModal persists the wizard result, registers the agent, and switches to it once it becomes healthy", async () => {
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

  it("AddServerModal closes without switching when the new agent never becomes healthy before the timeout", async () => {
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
    await saveDesktopConfig(bridge, createDefaultConfig());

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

    setPlatformBridgeForTests(null);
  });

  it("shows a lock overlay for an auth-failed agent, opens the relogin wizard prefilled with its email, and retries the identity on completion", async () => {
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
    const active = makeAgent({ identityId: "ia" });
    const other = makeAgent({
      identityId: "ib",
      serverName: "Relogin",
      origin: ORIGIN,
      status: "auth-failed",
    });
    const snapshot: RegistrySnapshot = { agents: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot, {
      getAgent: vi.fn((id: string) => (id === "ib" ? makeAgentHandle(retrySpy) : undefined)),
    });
    const user = userEvent.setup();

    renderWithContext(<DesktopRailOthers />, { registry });

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
    const active = makeAgent({ identityId: "ia" });
    const other = makeAgent({
      identityId: "ib",
      serverName: "Relogin",
      origin: ORIGIN,
      status: "auth-failed",
    });
    const snapshot: RegistrySnapshot = { agents: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot, {
      getAgent: vi.fn((id: string) => (id === "ib" ? makeAgentHandle(retrySpy) : undefined)),
    });
    const user = userEvent.setup();

    renderWithContext(<DesktopRailOthers />, { registry });

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
    const active = makeAgent({
      identityId: "ia",
      serverName: "Active",
      origin: ORIGIN,
      status: "auth-failed",
    });
    const snapshot: RegistrySnapshot = { agents: [active], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot, {
      getAgent: vi.fn((id: string) => (id === "ia" ? makeAgentHandle(retrySpy) : undefined)),
    });
    const user = userEvent.setup();

    renderWithContext(<DesktopRailActiveHeader />, { registry });

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

  it("shows a cloud-off overlay for an unreachable agent and retries immediately on click without opening a modal", async () => {
    const retrySpy = vi.fn();
    const active = makeAgent({ identityId: "ia" });
    const other = makeAgent({ identityId: "ib", serverName: "Beta", status: "unreachable" });
    const snapshot: RegistrySnapshot = { agents: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot, {
      getAgent: vi.fn((id: string) => (id === "ib" ? makeAgentHandle(retrySpy) : undefined)),
    });
    const user = userEvent.setup();

    renderWithContext(<DesktopRailOthers />, { registry });

    const retryButton = screen.getByTestId("desktop-server-retry");
    await user.click(retryButton);

    expect(retrySpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("wizard-email-input")).not.toBeInTheDocument();
  });

  it("shows a version-mismatch warning overlay and a connecting pulse", () => {
    const active = makeAgent({ identityId: "ia" });
    const other = makeAgent({ identityId: "ib", serverName: "Beta", status: "version-mismatch" });
    const snapshot: RegistrySnapshot = { agents: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(<DesktopRailOthers />, { registry });

    const warning = screen.getByTestId("desktop-server-incompatible");
    expect(warning.className).toContain("text-danger");
  });

  it("applies a pulse animation to a connecting agent's header tile", () => {
    const active = makeAgent({ identityId: "ia" });
    const other = makeAgent({ identityId: "ib", serverName: "Beta", status: "connecting" });
    const snapshot: RegistrySnapshot = { agents: [active, other], activeIdentityId: "ia" };
    const registry = makeRegistryStub(snapshot);

    renderWithContext(<DesktopRailOthers />, { registry });

    const header = screen.getByTestId("desktop-server-header");
    expect(header.className).toContain("animate-pulse");
  });
});
