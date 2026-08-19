import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { ConversationsSidebar } from "@/components/ConversationsSidebar";
import {
  ConnectionsContext,
  type ConnectionsContextValue,
} from "@/desktop/connections/ConnectionsContext";
import type {
  ConnectionRegistry,
  RegistrySnapshot,
} from "@/desktop/connections/ConnectionRegistry";
import type { ConnectionSnapshot } from "@/desktop/connections/IdentityConnection";
import { __resetUnifiedDmsCacheForTests } from "@/desktop/unifiedDms";
import type { ServerContext } from "@/desktop/connections/identityFetch";
import {
  registerIdentitySwitchHandler,
  setIdentitySwitchInProgress,
} from "@/platform/activeIdentity";
import { bumpDmListRevision } from "@/platform/dmListRevision";

const ORIGIN_B = "https://beta.example";

let mockParams: Record<string, string> = {};
const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    onClick,
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
    onClick?: () => void;
  }) => (
    <a
      data-testid={to === "/dm/$conversationId" ? "dm-row-link" : undefined}
      data-to={to}
      data-params={JSON.stringify(params)}
      onClick={onClick}
    >
      {children}
    </a>
  ),
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
}));

const notifyMock = vi.fn();
vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: notifyMock }),
}));

vi.mock("@/context/MobileNavContext", () => ({
  useMobileNav: () => ({ navOpen: false, closeNav: vi.fn() }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

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

function conversationPayload(overrides: Record<string, unknown>) {
  return {
    "@id": `/api/conversations/${overrides.identifier}`,
    "@type": "Conversation",
    id: 1,
    identifier: "c1",
    members: [],
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    lastMessageAt: "2026-08-01T00:00:00Z",
    unreadCount: 0,
    ...overrides,
  };
}

function makeRegistry(
  connections: ConnectionSnapshot[],
  activeIdentityId: string | null,
  handles: Record<string, { ctx: ServerContext }>,
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
      return { serverContext: () => handle.ctx } as never;
    },
  } as unknown as ConnectionRegistry;
}

function makeMutableRegistry(
  connections: ConnectionSnapshot[],
  activeIdentityId: string | null,
  handles: Record<string, { ctx: ServerContext }>,
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
      return { serverContext: () => handle.ctx } as never;
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

function makeWrapper(registry: ConnectionRegistry | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    if (!registry) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    const contextValue: ConnectionsContextValue = {
      registry,
      switchTo: vi.fn().mockResolvedValue(undefined),
    };
    return (
      <QueryClientProvider client={queryClient}>
        <ConnectionsContext.Provider value={contextValue}>{children}</ConnectionsContext.Provider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  __resetUnifiedDmsCacheForTests();
  configureApiClient(BASE);
  setAccessToken("jwt");
  notifyMock.mockReset();
  mockNavigate.mockReset();
  mockParams = {};
});

afterEach(() => {
  vi.unstubAllEnvs();
  registerIdentitySwitchHandler(null);
  setIdentitySwitchInProgress(false);
});

describe("ConversationsSidebar desktop variant", () => {
  it("merges conversations from every healthy identity, unread-first then recency", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    server.use(
      http.get(`${BASE}/api/v1/conversations`, () =>
        HttpResponse.json([
          conversationPayload({
            identifier: "a-read",
            unreadCount: 0,
            lastMessageAt: "2026-08-10T00:00:00Z",
          }),
        ]),
      ),
      http.get(`${ORIGIN_B}/api/v1/conversations`, () =>
        HttpResponse.json([
          conversationPayload({
            identifier: "b-unread",
            unreadCount: 2,
            lastMessageAt: "2026-08-01T00:00:00Z",
          }),
        ]),
      ),
    );

    const registry = makeRegistry(
      [
        connectionSnapshot({ identityId: "ia", serverName: "Alpha", origin: BASE }),
        connectionSnapshot({ identityId: "ib", serverName: "Beta", origin: ORIGIN_B, userId: 2 }),
      ],
      "ia",
      {
        ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" } },
        ib: { ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" } },
      },
    );

    render(<ConversationsSidebar />, { wrapper: makeWrapper(registry) });

    const rows = await screen.findAllByTestId("dm-row");
    expect(rows.map((r) => r.getAttribute("data-conversation-id"))).toEqual(["b-unread", "a-read"]);
  });

  it("shows a server chip on every row when more than one server is connected", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    server.use(
      http.get(`${BASE}/api/v1/conversations`, () =>
        HttpResponse.json([conversationPayload({ identifier: "a1" })]),
      ),
      http.get(`${ORIGIN_B}/api/v1/conversations`, () =>
        HttpResponse.json([conversationPayload({ identifier: "b1" })]),
      ),
    );

    const registry = makeRegistry(
      [
        connectionSnapshot({ identityId: "ia", serverName: "Alpha", origin: BASE }),
        connectionSnapshot({ identityId: "ib", serverName: "Beta", origin: ORIGIN_B, userId: 2 }),
      ],
      "ia",
      {
        ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" } },
        ib: { ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" } },
      },
    );

    render(<ConversationsSidebar />, { wrapper: makeWrapper(registry) });

    await waitFor(async () => expect(await screen.findAllByTestId("dm-row")).toHaveLength(2));
    const chips = screen.getAllByTestId("dm-server-chip");
    expect(chips.map((c) => c.getAttribute("title")).sort()).toEqual(["Alpha", "Beta"]);
    expect(chips.map((c) => c.textContent).sort()).toEqual(["A", "B"]);
  });

  it("routes a click on a non-active identity's row through requestIdentitySwitch", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const user = userEvent.setup();
    const switchHandler = vi.fn().mockResolvedValue(undefined);
    registerIdentitySwitchHandler(switchHandler);

    server.use(
      http.get(`${BASE}/api/v1/conversations`, () => HttpResponse.json([])),
      http.get(`${ORIGIN_B}/api/v1/conversations`, () =>
        HttpResponse.json([conversationPayload({ identifier: "b1" })]),
      ),
    );

    const registry = makeRegistry(
      [
        connectionSnapshot({ identityId: "ia", serverName: "Alpha", origin: BASE }),
        connectionSnapshot({ identityId: "ib", serverName: "Beta", origin: ORIGIN_B, userId: 2 }),
      ],
      "ia",
      {
        ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" } },
        ib: { ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" } },
      },
    );

    render(<ConversationsSidebar />, { wrapper: makeWrapper(registry) });

    const chip = await screen.findByTestId("dm-server-chip");
    const row = chip.closest("button");
    expect(row).not.toBeNull();
    await user.click(row as HTMLButtonElement);

    expect(switchHandler).toHaveBeenCalledWith("ib", {
      to: "/dm/$conversationId",
      params: { conversationId: "b1" },
    });
  });

  it("refetches only when a connection's conversationActivityAt or unreadCounts.dm changes", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    let hits = 0;
    server.use(
      http.get(`${BASE}/api/v1/conversations`, () => {
        hits += 1;
        return HttpResponse.json([conversationPayload({ identifier: "a1" })]);
      }),
    );

    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha", origin: BASE });
    const { registry, emit } = makeMutableRegistry([active], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" } },
    });

    render(<ConversationsSidebar />, { wrapper: makeWrapper(registry) });

    await waitFor(() => expect(hits).toBe(1));

    act(() => {
      emit([
        connectionSnapshot({
          identityId: "ia",
          serverName: "Alpha",
          origin: BASE,
          status: "healthy",
        }),
      ]);
    });
    await waitFor(() => expect(hits).toBe(1));

    act(() => {
      emit([
        connectionSnapshot({
          identityId: "ia",
          serverName: "Alpha",
          origin: BASE,
          unreadCounts: { dm: 3 },
        }),
      ]);
    });
    await waitFor(() => expect(hits).toBe(2));

    act(() => {
      emit([
        connectionSnapshot({
          identityId: "ia",
          serverName: "Alpha",
          origin: BASE,
          unreadCounts: { dm: 3 },
          conversationActivityAt: Date.now(),
        }),
      ]);
    });
    await waitFor(() => expect(hits).toBe(3));
  });

  it("refetches when a conversation mutation bumps the DM list revision", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    let hits = 0;
    server.use(
      http.get(`${BASE}/api/v1/conversations`, () => {
        hits += 1;
        return HttpResponse.json([conversationPayload({ identifier: "a1" })]);
      }),
    );

    const registry = makeRegistry(
      [connectionSnapshot({ identityId: "ia", serverName: "Alpha", origin: BASE })],
      "ia",
      { ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" } } },
    );

    render(<ConversationsSidebar />, { wrapper: makeWrapper(registry) });
    await waitFor(() => expect(hits).toBe(1));

    act(() => bumpDmListRevision());

    await waitFor(() => expect(hits).toBe(2));
  });

  it("skeletons on a fresh mount but reuses the cache while an identity switch is in flight", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    server.use(
      http.get(`${BASE}/api/v1/conversations`, () =>
        HttpResponse.json([conversationPayload({ identifier: "a1" })]),
      ),
    );

    const registry = makeRegistry(
      [connectionSnapshot({ identityId: "ia", serverName: "Alpha", origin: BASE })],
      "ia",
      { ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" } } },
    );

    const first = render(<ConversationsSidebar />, { wrapper: makeWrapper(registry) });
    await waitFor(async () => expect(await screen.findAllByTestId("dm-row")).toHaveLength(1));
    first.unmount();

    const remount = render(<ConversationsSidebar />, { wrapper: makeWrapper(registry) });
    expect(screen.getByTestId("conversation-rows-skeleton")).toBeInTheDocument();
    await waitFor(async () => expect(await screen.findAllByTestId("dm-row")).toHaveLength(1));
    remount.unmount();

    setIdentitySwitchInProgress(true);
    render(<ConversationsSidebar />, { wrapper: makeWrapper(registry) });
    expect(screen.queryByTestId("conversation-rows-skeleton")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("dm-row")).toHaveLength(1);
  });

  it("picks up a server that only becomes healthy after the first fetch", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    server.use(
      http.get(`${BASE}/api/v1/conversations`, () =>
        HttpResponse.json([conversationPayload({ identifier: "a1" })]),
      ),
      http.get(`${ORIGIN_B}/api/v1/conversations`, () =>
        HttpResponse.json([conversationPayload({ identifier: "b1" })]),
      ),
    );

    const active = connectionSnapshot({ identityId: "ia", serverName: "Alpha", origin: BASE });
    const connecting = connectionSnapshot({
      identityId: "ib",
      serverName: "Beta",
      origin: ORIGIN_B,
      userId: 2,
      status: "connecting",
    });
    const { registry, emit } = makeMutableRegistry([active, connecting], "ia", {
      ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" } },
      ib: { ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" } },
    });

    render(<ConversationsSidebar />, { wrapper: makeWrapper(registry) });

    await waitFor(async () => expect(await screen.findAllByTestId("dm-row")).toHaveLength(1));

    act(() => {
      emit([active, { ...connecting, status: "healthy" }]);
    });

    await waitFor(async () => expect(await screen.findAllByTestId("dm-row")).toHaveLength(2));
  });

  it("renders exactly the legacy single-server sidebar in web mode (no ConnectionsContext)", async () => {
    server.use(
      http.get(`${BASE}/api/v1/conversations`, () =>
        HttpResponse.json([conversationPayload({ identifier: "a1" })]),
      ),
    );

    render(<ConversationsSidebar />, { wrapper: makeWrapper(null) });

    await screen.findAllByTestId("dm-row-link");
    expect(screen.queryByTestId("dm-server-chip")).not.toBeInTheDocument();
  });

  it("renders the legacy sidebar even in desktop mode when ConnectionsContext is absent", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    server.use(
      http.get(`${BASE}/api/v1/conversations`, () =>
        HttpResponse.json([conversationPayload({ identifier: "a1" })]),
      ),
    );

    render(<ConversationsSidebar />, { wrapper: makeWrapper(null) });

    await screen.findAllByTestId("dm-row-link");
    expect(screen.queryByTestId("dm-server-chip")).not.toBeInTheDocument();
  });

  describe("compose identity select", () => {
    function setUpThreeIdentities() {
      server.use(
        http.get(`${BASE}/api/v1/conversations`, () => HttpResponse.json([])),
        http.get(`${ORIGIN_B}/api/v1/conversations`, () => HttpResponse.json([])),
      );
      return makeRegistry(
        [
          connectionSnapshot({ identityId: "ia", serverName: "Alpha", origin: BASE }),
          connectionSnapshot({
            identityId: "ib",
            serverName: "Beta",
            origin: ORIGIN_B,
            userId: 2,
          }),
          connectionSnapshot({
            identityId: "ic",
            serverName: "Gamma",
            origin: "https://gamma.example",
            status: "unreachable",
          }),
        ],
        "ia",
        {
          ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" } },
          ib: { ctx: { origin: ORIGIN_B, apiVersion: "v1", getToken: () => "jwt-b" } },
        },
      );
    }

    it("renders no server picker in the sidebar; + navigates straight to /dm/new", async () => {
      vi.stubEnv("VITE_APP_MODE", "desktop");
      const user = userEvent.setup();
      const switchHandler = vi.fn().mockResolvedValue(undefined);
      registerIdentitySwitchHandler(switchHandler);
      const registry = setUpThreeIdentities();

      render(<ConversationsSidebar />, { wrapper: makeWrapper(registry) });

      const composeButton = await screen.findByTestId("dm-compose-button");
      expect(screen.queryByTestId("dm-compose-identity-select")).not.toBeInTheDocument();

      await user.click(composeButton);

      expect(mockNavigate).toHaveBeenCalledWith({ to: "/dm/new" });
      expect(switchHandler).not.toHaveBeenCalled();
    });
  });

  describe("compose button with a single healthy identity", () => {
    it("renders no identity select and the + button navigates straight to /dm/new", async () => {
      vi.stubEnv("VITE_APP_MODE", "desktop");
      const user = userEvent.setup();
      server.use(http.get(`${BASE}/api/v1/conversations`, () => HttpResponse.json([])));

      const registry = makeRegistry(
        [connectionSnapshot({ identityId: "ia", serverName: "Alpha", origin: BASE })],
        "ia",
        { ia: { ctx: { origin: BASE, apiVersion: "v1", getToken: () => "jwt" } } },
      );

      render(<ConversationsSidebar />, { wrapper: makeWrapper(registry) });

      const composeButton = await screen.findByTestId("dm-compose-button");
      expect(screen.queryByTestId("dm-compose-identity-select")).not.toBeInTheDocument();

      await user.click(composeButton);

      expect(mockNavigate).toHaveBeenCalledWith({ to: "/dm/new" });
    });
  });
});
