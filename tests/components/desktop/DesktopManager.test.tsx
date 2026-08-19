import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DragEndEvent } from "@dnd-kit/core";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { CommunityManagerModal } from "@/components/CommunityManagerModal";
import {
  ConnectionsContext,
  type ConnectionsContextValue,
} from "@/desktop/connections/ConnectionsContext";
import type {
  ConnectionRegistry,
  RegistrySnapshot,
} from "@/desktop/connections/ConnectionRegistry";
import type {
  ConnectionSnapshot,
  ConnectionCommunity,
} from "@/desktop/connections/IdentityConnection";
import type { ServerContext } from "@/desktop/connections/identityFetch";
import { registerIdentitySwitchHandler } from "@/platform/activeIdentity";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { createDefaultConfig, loadDesktopConfig, saveDesktopConfig } from "@/desktop/desktopConfig";
import {
  __resetServerOrderStoreForTests,
  getServerOrderSnapshot,
} from "@/desktop/serverOrderStore";

let capturedDragEnd: ((event: DragEndEvent) => void) | null = null;

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: Parameters<typeof actual.DndContext>[0]) => {
      capturedDragEnd = props.onDragEnd ?? null;
      return <actual.DndContext {...props} />;
    },
  };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <a onClick={onClick}>{children}</a>
  ),
}));

const notifyMock = vi.fn();
vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: notifyMock }),
}));

const ORIGIN_B = "https://beta.example";

function community(overrides: Partial<ConnectionCommunity>): ConnectionCommunity {
  return {
    id: 1,
    identifier: "beta-town",
    name: "Beta Town",
    logoUrl: null,
    accentColor: null,
    iri: null,
    member: true,
    pinned: false,
    isPrivate: false,
    ...overrides,
  };
}

function connectionSnapshot(overrides: Partial<ConnectionSnapshot>): ConnectionSnapshot {
  return {
    identityId: "ia",
    status: "healthy",
    serverName: "Alpha",
    origin: BASE,
    userId: 1,
    communities: [],
    unreadCounts: {},
    conversationActivityAt: null,
    error: null,
    ...overrides,
  };
}

function makeRegistry(
  connections: ConnectionSnapshot[],
  activeIdentityId: string | null,
  handles: Record<string, { ctx: ServerContext; refreshData: ReturnType<typeof vi.fn> }>,
): ConnectionRegistry {
  const listeners = new Set<() => void>();
  const snapshot: RegistrySnapshot = { connections, activeIdentityId };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getConnection: (id: string) => {
      const handle = handles[id];
      if (!handle) return undefined;
      return { serverContext: () => handle.ctx, refreshData: handle.refreshData } as never;
    },
  } as unknown as ConnectionRegistry;
}

function makeMutableRegistry(
  connections: ConnectionSnapshot[],
  activeIdentityId: string | null,
  handles: Record<string, { ctx: ServerContext; refreshData: ReturnType<typeof vi.fn> }>,
): { registry: ConnectionRegistry; emit: (connections: ConnectionSnapshot[]) => void } {
  const listeners = new Set<() => void>();
  let snapshot: RegistrySnapshot = { connections, activeIdentityId };
  const registry = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getConnection: (id: string) => {
      const handle = handles[id];
      if (!handle) return undefined;
      return { serverContext: () => ({ ...handle.ctx }), refreshData: handle.refreshData } as never;
    },
  } as unknown as ConnectionRegistry;
  return {
    registry,
    emit: (nextConnections: ConnectionSnapshot[]) => {
      snapshot = { connections: nextConnections, activeIdentityId };
      listeners.forEach((listener) => listener());
    },
  };
}

function makeWrapper(registry: ConnectionRegistry) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const contextValue: ConnectionsContextValue = {
    registry,
    switchTo: vi.fn().mockResolvedValue(undefined),
  };
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ConnectionsContext.Provider value={contextValue}>{children}</ConnectionsContext.Provider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("jwt");
  notifyMock.mockReset();
  server.use(
    http.get(`${BASE}/api/v1/communities`, () => HttpResponse.json([])),
    http.get(`${BASE}/api/v1/me/community-memberships`, () => HttpResponse.json([])),
    http.get(`${BASE}/api/v1/me/pinned-communities`, () => HttpResponse.json([])),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  registerIdentitySwitchHandler(null);
  __resetServerOrderStoreForTests();
  setPlatformBridgeForTests(null);
  capturedDragEnd = null;
});

describe("CommunityManagerModal desktop variant", () => {
  it("renders one group per identity with server chips, in desktop managed mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha" });
    const other = connectionSnapshot({ identityId: "ib", serverName: "Beta", origin: ORIGIN_B });
    const registry = makeRegistry([active, other], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" }, refreshData: vi.fn() },
      ib: {
        ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" },
        refreshData: vi.fn(),
      },
    });

    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper(registry) });

    const chips = await screen.findAllByTestId("manager-server-chip");
    expect(chips.map((c) => c.textContent)).toEqual(["Alpha", "Beta"]);
  });

  it("issues a pin request against the non-active identity's own origin and refreshes that connection", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const user = userEvent.setup();
    let capturedBody: unknown = null;
    server.use(
      http.post(`${ORIGIN_B}/api/v1/me/pinned-communities`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({});
      }),
    );

    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha" });
    const other = connectionSnapshot({
      identityId: "ib",
      serverName: "Beta",
      origin: ORIGIN_B,
      communities: [
        community({
          id: 42,
          identifier: "beta-town",
          name: "Beta Town",
          member: true,
          pinned: false,
        }),
      ],
    });
    const refreshB = vi.fn();
    const registry = makeRegistry([active, other], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" }, refreshData: vi.fn() },
      ib: {
        ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" },
        refreshData: refreshB,
      },
    });

    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper(registry) });

    await user.click(screen.getByTestId("manager-tab-your"));
    const betaGroup = (await screen.findByText("Beta")).closest(
      "[data-testid=manager-identity-group]",
    );
    expect(betaGroup).not.toBeNull();
    await user.click(within(betaGroup as HTMLElement).getByRole("button", { name: "Pin" }));

    await waitFor(() => expect(capturedBody).toEqual({ communityId: 42 }));
    await waitFor(() => expect(refreshB).toHaveBeenCalled());
  });

  it("reorders a non-active identity's pinned communities against its own origin and refreshes that connection", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    let capturedBody: unknown = null;
    server.use(
      http.post(`${ORIGIN_B}/api/v1/me/pinned-communities/order`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({});
      }),
    );

    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha" });
    const other = connectionSnapshot({
      identityId: "ib",
      serverName: "Beta",
      origin: ORIGIN_B,
      communities: [
        community({ id: 42, identifier: "beta-town", name: "Beta Town", pinned: true }),
        community({ id: 43, identifier: "beta-city", name: "Beta City", pinned: true }),
      ],
    });
    const refreshB = vi.fn();
    const registry = makeRegistry([active, other], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" }, refreshData: vi.fn() },
      ib: {
        ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" },
        refreshData: refreshB,
      },
    });

    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper(registry) });

    const betaGroup = (await screen.findByText("Beta")).closest(
      "[data-testid=manager-identity-group]",
    );
    expect(betaGroup).not.toBeNull();
    const rows = within(betaGroup as HTMLElement).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    fireEvent.dragStart(rows[0]!);
    fireEvent.dragOver(rows[1]!);
    fireEvent.drop(rows[1]!);

    await waitFor(() => expect(capturedBody).toEqual({ communityIds: [43, 42] }));
    await waitFor(() => expect(refreshB).toHaveBeenCalled());
  });

  it("routes a click on a non-active identity's community row through requestIdentitySwitch, then closes", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const user = userEvent.setup();
    const switchHandler = vi.fn().mockResolvedValue(undefined);
    registerIdentitySwitchHandler(switchHandler);
    const onClose = vi.fn();

    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha" });
    const other = connectionSnapshot({
      identityId: "ib",
      serverName: "Beta",
      origin: ORIGIN_B,
      communities: [
        community({
          id: 42,
          identifier: "beta-town",
          name: "Beta Town",
          member: true,
          pinned: false,
        }),
      ],
    });
    const registry = makeRegistry([active, other], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" }, refreshData: vi.fn() },
      ib: {
        ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" },
        refreshData: vi.fn(),
      },
    });

    render(<CommunityManagerModal onClose={onClose} />, { wrapper: makeWrapper(registry) });

    await user.click(screen.getByTestId("manager-tab-your"));
    await user.click(await screen.findByText("Beta Town"));

    expect(switchHandler).toHaveBeenCalledWith("ib", {
      to: "/$communityId",
      params: { communityId: "beta-town" },
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("greys out an unhealthy identity group and disables its actions", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha" });
    const other = connectionSnapshot({
      identityId: "ib",
      serverName: "Beta",
      origin: ORIGIN_B,
      status: "unreachable",
      communities: [
        community({
          id: 42,
          identifier: "beta-town",
          name: "Beta Town",
          member: true,
          pinned: false,
        }),
      ],
    });
    const registry = makeRegistry([active, other], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" }, refreshData: vi.fn() },
    });

    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper(registry) });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("manager-tab-your"));

    const betaGroup = (await screen.findByText("Beta")).closest(
      "[data-testid=manager-identity-group]",
    );
    expect(betaGroup).not.toBeNull();
    expect((betaGroup as HTMLElement).className).toContain("opacity");
    const pinButton = within(betaGroup as HTMLElement).getByRole("button", { name: "Pin" });
    expect(pinButton).toBeDisabled();
  });

  it("excludes a private non-member community from the remote Other tab", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const user = userEvent.setup();

    server.use(
      http.get(`${ORIGIN_B}/api/v1/communities`, () =>
        HttpResponse.json([
          {
            "@id": "/api/communities/secret-club",
            id: 42,
            identifier: "secret-club",
            name: "Secret Club",
            isPrivate: true,
            accentColor: null,
            logo: null,
          },
          {
            "@id": "/api/communities/open-club",
            id: 43,
            identifier: "open-club",
            name: "Open Club",
            isPrivate: false,
            accentColor: null,
            logo: null,
          },
        ]),
      ),
    );

    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha" });
    const other = connectionSnapshot({ identityId: "ib", serverName: "Beta", origin: ORIGIN_B });
    const registry = makeRegistry([active, other], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" }, refreshData: vi.fn() },
      ib: {
        ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" },
        refreshData: vi.fn(),
      },
    });

    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper(registry) });

    await user.click(screen.getByTestId("manager-tab-other"));
    await user.selectOptions(await screen.findByTestId("manager-browse-select"), "ib");

    expect(await screen.findByText("Open Club")).toBeInTheDocument();
    expect(screen.queryByText("Secret Club")).not.toBeInTheDocument();
  });

  it("defaults the browse selector to the active identity's own communities", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const user = userEvent.setup();

    server.use(
      http.get(`${BASE}/api/v1/communities`, () =>
        HttpResponse.json([
          {
            "@id": "/api/communities/alpha-club",
            id: 7,
            identifier: "alpha-club",
            name: "Alpha Club",
            isPrivate: false,
            accentColor: null,
            logo: null,
          },
        ]),
      ),
      http.get(`${BASE}/api/v1/me/community-memberships`, () => HttpResponse.json([])),
    );

    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha" });
    const other = connectionSnapshot({ identityId: "ib", serverName: "Beta", origin: ORIGIN_B });
    const registry = makeRegistry([active, other], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" }, refreshData: vi.fn() },
      ib: {
        ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" },
        refreshData: vi.fn(),
      },
    });

    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper(registry) });

    await user.click(screen.getByTestId("manager-tab-other"));

    const select = await screen.findByTestId("manager-browse-select");
    expect((select as HTMLSelectElement).value).toBe("ia");
    expect(await screen.findByText("Alpha Club")).toBeInTheDocument();
  });

  it("loads a non-active identity's communities fresh over the network, ignoring the stale connection snapshot", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const user = userEvent.setup();

    server.use(
      http.get(`${ORIGIN_B}/api/v1/communities`, () =>
        HttpResponse.json([
          {
            "@id": "/api/communities/beta-club",
            id: 99,
            identifier: "beta-club",
            name: "Beta Club",
            isPrivate: false,
            accentColor: null,
            logo: null,
          },
        ]),
      ),
    );

    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha" });
    const other = connectionSnapshot({
      identityId: "ib",
      serverName: "Beta",
      origin: ORIGIN_B,
      communities: [],
    });
    const registry = makeRegistry([active, other], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" }, refreshData: vi.fn() },
      ib: {
        ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" },
        refreshData: vi.fn(),
      },
    });

    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper(registry) });

    await user.click(screen.getByTestId("manager-tab-other"));
    await user.selectOptions(await screen.findByTestId("manager-browse-select"), "ib");

    expect(await screen.findByText("Beta Club")).toBeInTheDocument();
  });

  it("joins a community on the selected non-active identity, posting to its own origin and refreshing that connection", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const user = userEvent.setup();
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;

    server.use(
      http.get(`${ORIGIN_B}/api/v1/communities`, () =>
        HttpResponse.json([
          {
            "@id": "/api/communities/beta-club",
            id: 99,
            identifier: "beta-club",
            name: "Beta Club",
            isPrivate: false,
            accentColor: null,
            logo: null,
          },
        ]),
      ),
      http.post(`${ORIGIN_B}/api/v1/communities/beta-club/members`, async ({ request }) => {
        capturedPath = new URL(request.url).pathname;
        capturedBody = await request.json();
        return HttpResponse.json({});
      }),
    );

    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha" });
    const other = connectionSnapshot({
      identityId: "ib",
      serverName: "Beta",
      origin: ORIGIN_B,
      communities: [],
    });
    const refreshB = vi.fn();
    const registry = makeRegistry([active, other], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" }, refreshData: vi.fn() },
      ib: {
        ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" },
        refreshData: refreshB,
      },
    });

    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper(registry) });

    await user.click(screen.getByTestId("manager-tab-other"));
    await user.selectOptions(await screen.findByTestId("manager-browse-select"), "ib");
    await user.click(await screen.findByRole("button", { name: "Join community" }));

    await waitFor(() => expect(capturedPath).toBe("/api/v1/communities/beta-club/members"));
    expect(capturedBody).toEqual({});
    await waitFor(() => expect(refreshB).toHaveBeenCalled());
  });

  it("does not refetch the remote browse list when an unrelated registry snapshot event fires", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const user = userEvent.setup();
    let fetchCount = 0;

    server.use(
      http.get(`${ORIGIN_B}/api/v1/communities`, () => {
        fetchCount += 1;
        return HttpResponse.json([
          {
            "@id": "/api/communities/beta-club",
            id: 99,
            identifier: "beta-club",
            name: "Beta Club",
            isPrivate: false,
            accentColor: null,
            logo: null,
          },
        ]);
      }),
    );

    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha" });
    const other = connectionSnapshot({
      identityId: "ib",
      serverName: "Beta",
      origin: ORIGIN_B,
      communities: [],
    });
    const { registry, emit } = makeMutableRegistry([active, other], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" }, refreshData: vi.fn() },
      ib: {
        ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" },
        refreshData: vi.fn(),
      },
    });

    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper(registry) });

    await user.click(screen.getByTestId("manager-tab-other"));
    await user.selectOptions(await screen.findByTestId("manager-browse-select"), "ib");

    expect(await screen.findByText("Beta Club")).toBeInTheDocument();
    await waitFor(() => expect(fetchCount).toBe(1));

    act(() => {
      emit([
        connectionSnapshot({
          identityId: "ia",
          serverName: "Alpha",
          unreadCounts: { general: 1 },
        }),
        other,
      ]);
    });

    expect(await screen.findByText("Beta Club")).toBeInTheDocument();
    expect(fetchCount).toBe(1);
  });

  it("shows drag handles on group headers only in the Pinned tab", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha" });
    const other = connectionSnapshot({ identityId: "ib", serverName: "Beta", origin: ORIGIN_B });
    const registry = makeRegistry([active, other], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" }, refreshData: vi.fn() },
      ib: {
        ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" },
        refreshData: vi.fn(),
      },
    });
    const user = userEvent.setup();

    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper(registry) });

    expect(await screen.findAllByTestId("manager-server-drag-handle")).toHaveLength(2);

    await user.click(screen.getByTestId("manager-tab-your"));

    expect(screen.queryAllByTestId("manager-server-drag-handle")).toHaveLength(0);
  });

  it("persists a new server order when a group header is dragged, and re-renders the panel in that order", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await saveDesktopConfig(bridge, createDefaultConfig());

    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha" });
    const other = connectionSnapshot({ identityId: "ib", serverName: "Beta", origin: ORIGIN_B });
    const registry = makeRegistry([active, other], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" }, refreshData: vi.fn() },
      ib: {
        ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" },
        refreshData: vi.fn(),
      },
    });

    render(<CommunityManagerModal onClose={vi.fn()} />, { wrapper: makeWrapper(registry) });

    await screen.findAllByTestId("manager-server-chip");
    expect(capturedDragEnd).not.toBeNull();

    capturedDragEnd?.({ active: { id: "ib" }, over: { id: "ia" } } as unknown as DragEndEvent);

    await waitFor(async () => {
      const persisted = await loadDesktopConfig(bridge);
      expect(persisted.profiles[0]?.serverOrder).toEqual(["ib", "ia"]);
    });
    expect(getServerOrderSnapshot()).toEqual(["ib", "ia"]);

    await waitFor(() => {
      const chips = screen.getAllByTestId("manager-server-chip");
      expect(chips.map((c) => c.textContent)).toEqual(["Beta", "Alpha"]);
    });
  });

  it("renders exactly the legacy single-server modal in web mode (no ConnectionsContext)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    server.use(
      http.get(`${BASE}/api/v1/communities`, () =>
        HttpResponse.json([
          {
            "@id": "/api/communities/member-town",
            id: 1,
            identifier: "member-town",
            name: "member-town",
            isPrivate: false,
            accentColor: null,
            logo: null,
          },
        ]),
      ),
      http.get(`${BASE}/api/v1/me/community-memberships`, () =>
        HttpResponse.json([{ communityId: 1, role: "member" }]),
      ),
    );

    render(<CommunityManagerModal onClose={vi.fn()} />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("manager-tab-your"));

    expect(await screen.findByText("member-town")).toBeInTheDocument();
    expect(screen.queryByTestId("manager-identity-group")).not.toBeInTheDocument();
    expect(screen.queryByTestId("manager-server-chip")).not.toBeInTheDocument();
  });

  it("renders the legacy modal even in desktop mode when ConnectionsContext is absent", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(<CommunityManagerModal onClose={vi.fn()} />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("manager-tab-your"));

    expect(screen.queryByTestId("manager-identity-group")).not.toBeInTheDocument();
  });
});
