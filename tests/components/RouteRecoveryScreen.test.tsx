import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { RouteRecoveryScreen } from "@/components/RouteRecoveryScreen";
import {
  ConnectionsContext,
  type ConnectionsContextValue,
} from "@/desktop/connections/ConnectionsContext";
import type {
  ConnectionRegistry,
  RegistrySnapshot,
} from "@/desktop/connections/ConnectionRegistry";
import { ApiError, configureApiClient } from "@/api/client";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { TEST_BASE_URL as BASE } from "../fixtures";

const invalidate = vi.fn(() => Promise.resolve());
const navigate = vi.fn(() => Promise.resolve());
let pathname = "/c/general";
let token: string | null = "jwt";
const logout = vi.fn(() => Promise.resolve());

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    invalidate,
    navigate,
    state: { location: { href: "/c/general" }, matches: [] },
  }),
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname } }),
}));

const removeServerById = vi.fn(() => Promise.resolve(true));
const continueAfterRemovingActive = vi.fn();

vi.mock("@/desktop/identityLifecycle", () => ({
  removeServerById: (...args: unknown[]) => removeServerById(...(args as [])),
  continueAfterRemovingActive: (...args: unknown[]) => continueAfterRemovingActive(...(args as [])),
}));

vi.mock("@/platform/bridge", () => ({ getPlatformBridge: () => ({}) }));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ token, logout }),
}));

function desktopWrapper(switchTo: ConnectionsContextValue["switchTo"]) {
  const snapshot = {
    activeIdentityId: "a",
    connections: [
      { identityId: "a", serverName: "Broken", origin: "https://broken.example" },
      { identityId: "b", serverName: null, origin: "https://healthy.example" },
    ],
  } as unknown as RegistrySnapshot;
  const registry = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
  } as unknown as ConnectionRegistry;
  return ({ children }: { children: ReactNode }) => (
    <ConnectionsContext.Provider value={{ registry, switchTo }}>
      {children}
    </ConnectionsContext.Provider>
  );
}

describe("RouteRecoveryScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = "/c/general";
    token = "jwt";
  });

  it("explains a network failure and, once the server answers, reloads the current location", async () => {
    configureApiClient(BASE);
    server.use(http.get(`${BASE}/api/v1/server-info`, () => HttpResponse.json({})));
    const reset = vi.fn();
    render(<RouteRecoveryScreen error={new TypeError("Failed to fetch")} reset={reset} />);

    expect(screen.getByTestId("auth-error")).toHaveTextContent("Can't reach the server.");
    fireEvent.click(screen.getByTestId("recovery-retry"));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ href: "/c/general", replace: true }),
    );
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("shows the generic message for a client error and offers going home", () => {
    const reset = vi.fn();
    render(<RouteRecoveryScreen error={new ApiError(404, {})} reset={reset} />);

    expect(screen.getByTestId("auth-error")).toHaveTextContent("This page failed to load.");
    fireEvent.click(screen.getByTestId("recovery-home"));

    expect(navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("hides go-home on the home page and sign-out when signed out", () => {
    pathname = "/";
    token = null;
    render(<RouteRecoveryScreen error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.queryByTestId("recovery-home")).toBeNull();
    expect(screen.queryByTestId("recovery-sign-out")).toBeNull();
  });

  it("signs out and returns home", async () => {
    render(<RouteRecoveryScreen error={new Error("boom")} reset={vi.fn()} />);

    fireEvent.click(screen.getByTestId("recovery-sign-out"));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
    expect(logout).toHaveBeenCalled();
  });

  it("offers no server switch outside the desktop app", () => {
    render(<RouteRecoveryScreen error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.queryByTestId("recovery-other-servers")).toBeNull();
  });

  it("lets a desktop user switch to another server", () => {
    const switchTo = vi.fn(() => Promise.resolve());
    render(<RouteRecoveryScreen error={new TypeError("Failed to fetch")} reset={vi.fn()} />, {
      wrapper: desktopWrapper(switchTo),
    });

    const buttons = screen.getAllByTestId("recovery-switch-server");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("healthy.example");
    fireEvent.click(buttons[0]!);

    expect(switchTo).toHaveBeenCalledWith("b");
  });

  it("lets a desktop user remove the failing server after confirming", async () => {
    const switchTo = vi.fn(() => Promise.resolve());
    render(<RouteRecoveryScreen error={new TypeError("Failed to fetch")} reset={vi.fn()} />, {
      wrapper: desktopWrapper(switchTo),
    });

    fireEvent.click(screen.getByTestId("recovery-remove-server"));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove identity" }),
    );

    await waitFor(() => expect(continueAfterRemovingActive).toHaveBeenCalled());
    expect(removeServerById).toHaveBeenCalledWith(expect.anything(), expect.anything(), "a");
  });

  it("offers no server removal outside the desktop app", () => {
    render(<RouteRecoveryScreen error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.queryByTestId("recovery-remove-server")).toBeNull();
  });
});
