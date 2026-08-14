import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { AddServerModal, DesktopRailActiveHeader, DesktopRailOthers } from "@/desktop/DesktopRail";
import { AgentsContext, type AgentsContextValue } from "@/desktop/agents/AgentsContext";
import type { AgentRegistry, RegistrySnapshot } from "@/desktop/agents/AgentRegistry";
import type { AgentSnapshot } from "@/desktop/agents/IdentityAgent";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import { createDefaultConfig, saveDesktopConfig } from "@/desktop/desktopConfig";

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

  it("AddServerModal persists the wizard result, registers the agent, and switches to it", async () => {
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

    const registry = makeRegistryStub({ agents: [], activeIdentityId: null });
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

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(addIdentitySpy).toHaveBeenCalledTimes(1);
    const addedIdentity = addIdentitySpy.mock.calls[0]![0];
    expect(addedIdentity.serverUrl).toBe(ORIGIN);
    expect(addedIdentity.email).toBe("a@b.c");
    await waitFor(() => expect(switchTo).toHaveBeenCalledWith(addedIdentity.id));

    setPlatformBridgeForTests(null);
  });
});
