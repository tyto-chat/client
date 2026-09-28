import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserProfileButton } from "@/components/UserProfileButton";
import {
  ConnectionsContext,
  type ConnectionsContextValue,
} from "@/desktop/connections/ConnectionsContext";
import type {
  ConnectionRegistry,
  RegistrySnapshot,
} from "@/desktop/connections/ConnectionRegistry";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import { setAccessToken } from "@/api/tokenStore";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, token: null, logout: vi.fn(), refreshUser: vi.fn() }),
}));
vi.mock("@/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openLogin: vi.fn() }),
}));
vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));
vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark", toggle: vi.fn() }),
}));
vi.mock("@/queries/presenceQueries", () => ({
  usePresenceSubscription: () => {},
  useUserPresence: () => "offline",
  useSetManualPresence: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const snapshot: RegistrySnapshot = { connections: [], activeIdentityId: "ia" };
const registry = {
  getSnapshot: () => snapshot,
  subscribe: () => () => {},
  getConnection: () => undefined,
} as unknown as ConnectionRegistry;

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const value: ConnectionsContextValue = {
    registry,
    switchTo: vi.fn().mockResolvedValue(undefined),
  };
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionsContext.Provider value={value}>{children}</ConnectionsContext.Provider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubEnv("VITE_APP_MODE", "desktop");
  configureApiClient(BASE);
  setAccessToken(null);
  setPlatformBridgeForTests(createFakePlatformBridge());
});

afterEach(() => {
  vi.unstubAllEnvs();
  setPlatformBridgeForTests(null);
});

describe("rail account button while browsing as a guest", () => {
  it("opens a menu offering sign-in and the identity manager", async () => {
    const user = userEvent.setup();
    render(<UserProfileButton />, { wrapper });

    expect(screen.queryByTestId("guest-menu")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("guest-menu-button"));

    expect(screen.getByTestId("guest-menu-sign-in")).toBeInTheDocument();
    await user.click(screen.getByTestId("manage-identities-menu-entry"));

    expect(await screen.findByTestId("identity-manager")).toBeInTheDocument();
  });

  it("keeps the plain web sign-in button when identities are not managed", async () => {
    vi.stubEnv("VITE_APP_MODE", "");
    render(<UserProfileButton />, { wrapper });

    expect(screen.getByTestId("guest-sign-in")).toBeInTheDocument();
    expect(screen.queryByTestId("guest-menu-button")).not.toBeInTheDocument();
  });
});
