import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { server } from "../mocks/server";
import { RouteRecoveryScreen } from "@/components/RouteRecoveryScreen";
import { NotificationProvider } from "@/context/NotificationContext";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../fixtures";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ token: null, logout: vi.fn() }),
}));

function renderNested(channelLoader: () => Promise<unknown>) {
  const rootRoute = createRootRoute({
    component: Outlet,
    beforeLoad: () => new Promise<void>((r) => setTimeout(r, 20)),
  });
  const shellRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "shell",
    component: () => (
      <div>
        <span>shell</span>
        <Outlet />
      </div>
    ),
  });
  const channelRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/c/$channel",
    loader: channelLoader,
    component: () => <div>channel</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([shellRoute.addChildren([channelRoute])]),
    history: createMemoryHistory({ initialEntries: ["/c/general"] }),
    defaultErrorComponent: RouteRecoveryScreen,
  });
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationProvider>
        <RouterProvider router={router} />
      </NotificationProvider>
    </QueryClientProvider>,
  );
  return container;
}

describe("RouteRecoveryScreen on a nested route behind an async root", () => {
  it("never unmounts the app while retrying and keeps the card until the reload settles", async () => {
    configureApiClient(BASE);
    server.use(http.get(`${BASE}/api/v1/server-info`, () => HttpResponse.json({})));
    const uncaught = vi.fn();
    window.addEventListener("error", uncaught);
    let attempts = 0;
    let finish: () => void = () => {};
    const container = renderNested(() => {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new TypeError("Failed to fetch"));
      return new Promise<void>((r) => {
        finish = r;
      });
    });

    fireEvent.click(await screen.findByTestId("recovery-retry"));
    await waitFor(() => expect(attempts).toBe(2));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(container.innerHTML).not.toBe("");
    expect(screen.getByText("shell")).toBeInTheDocument();
    expect(screen.getByTestId("route-recovery")).toBeInTheDocument();

    await act(async () => finish());
    expect(await screen.findByText("channel")).toBeInTheDocument();
    window.removeEventListener("error", uncaught);
    expect(uncaught).not.toHaveBeenCalled();
  });
});
