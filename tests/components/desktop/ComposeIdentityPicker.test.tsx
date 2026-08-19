import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import {
  ConnectionsContext,
  type ConnectionsContextValue,
} from "@/desktop/connections/ConnectionsContext";
import type {
  ConnectionRegistry,
  RegistrySnapshot,
} from "@/desktop/connections/ConnectionRegistry";
import type { ConnectionSnapshot } from "@/desktop/connections/IdentityConnection";
import type { ServerContext } from "@/desktop/connections/identityFetch";
import { registerIdentitySwitchHandler } from "@/platform/activeIdentity";
import { ComposeConversation } from "@/components/dm/ComposeConversation";

const ORIGIN_B = "https://beta.example";
const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  useNavigate: () => mockNavigate,
}));

const notifyMock = vi.fn();
vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: notifyMock }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

vi.mock("@/context/TimezoneContext", () => ({
  useTimezone: () => ({ timezone: "UTC" }),
}));

vi.mock("@/components/MobileTopBar", () => ({
  MobileTopBar: () => null,
}));

vi.mock("@/components/chat/MessagePane", () => ({
  MessagePane: ({ onSend }: { onSend: (text: string) => void }) => (
    <button onClick={() => onSend("hello")}>send-stub</button>
  ),
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

function twoIdentityRegistry(): ConnectionRegistry {
  return makeRegistry(
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
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("jwt");
  mockNavigate.mockReset();
  notifyMock.mockReset();
  registerIdentitySwitchHandler(null);
  server.use(
    http.get(`${BASE}/api/v1/me/invitable-users`, () =>
      HttpResponse.json({ items: [{ id: 10, name: "Alice", avatarUrl: null }] }),
    ),
    http.get(`${ORIGIN_B}/api/v1/me/invitable-users`, () =>
      HttpResponse.json({ items: [{ id: 20, name: "Bora", avatarUrl: null }] }),
    ),
  );
});

describe("ComposeConversation identity picker", () => {
  it("shows the server select with the active identity preselected, listing healthy servers", async () => {
    render(<ComposeConversation />, { wrapper: makeWrapper(twoIdentityRegistry()) });

    const select = (await screen.findByTestId("dm-compose-identity-select")) as HTMLSelectElement;
    expect(select.value).toBe("ia");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Alpha", "Beta"]);
  });

  it("renders no server select without a multi-identity registry", async () => {
    render(<ComposeConversation />, { wrapper: makeWrapper(null) });

    await screen.findByText("send-stub");
    expect(screen.queryByTestId("dm-compose-identity-select")).not.toBeInTheDocument();
  });

  it("changing the server clears picked recipients and searches users on the selected server", async () => {
    const user = userEvent.setup();
    render(<ComposeConversation />, { wrapper: makeWrapper(twoIdentityRegistry()) });

    await user.click(await screen.findByTestId("picker-chip-10"));
    expect(screen.getByText(/Alice/)).toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("dm-compose-identity-select"), "ib");

    expect(screen.queryByText(/Alice/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Bora/)).toBeInTheDocument());
  });

  it("sending on a remote server creates the conversation there, then switches identity to it", async () => {
    const user = userEvent.setup();
    const switchHandler = vi.fn().mockResolvedValue(undefined);
    registerIdentitySwitchHandler(switchHandler);
    let createdBody: unknown = null;
    let messageBody: unknown = null;
    server.use(
      http.post(`${ORIGIN_B}/api/v1/conversations`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json({ "@id": "/api/conversations/remote-c", identifier: "remote-c" });
      }),
      http.post(`${ORIGIN_B}/api/v1/conversations/remote-c/messages`, async ({ request }) => {
        messageBody = await request.json();
        return HttpResponse.json({ "@id": "/api/messages/m1" }, { status: 201 });
      }),
    );

    render(<ComposeConversation />, { wrapper: makeWrapper(twoIdentityRegistry()) });

    await user.selectOptions(await screen.findByTestId("dm-compose-identity-select"), "ib");
    await waitFor(() => expect(screen.getByText(/Bora/)).toBeInTheDocument());
    await user.click(screen.getByTestId("picker-chip-20"));
    await user.click(screen.getByText("send-stub"));

    await waitFor(() =>
      expect(switchHandler).toHaveBeenCalledWith("ib", {
        to: "/dm/$conversationId",
        params: { conversationId: "remote-c" },
      }),
    );
    expect(createdBody).toEqual({ memberUserIds: [20] });
    expect(messageBody).toEqual({ text: "hello", attachmentIris: [] });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
