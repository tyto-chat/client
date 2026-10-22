import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { RouteRecoveryScreen } from "@/components/RouteRecoveryScreen";
import { NotificationProvider } from "@/context/NotificationContext";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ token: null, logout: vi.fn() }),
}));

describe("RouteRecoveryScreen retry", () => {
  it("never renders an empty app while a root-level retry is pending", async () => {
    let attempts = 0;
    const rootRoute = createRootRoute({
      component: Outlet,
      beforeLoad: () => {
        attempts += 1;
        if (attempts === 1) return Promise.reject(new TypeError("Failed to fetch"));
        return new Promise<void>(() => {});
      },
    });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <div>home</div>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
      defaultErrorComponent: RouteRecoveryScreen,
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <NotificationProvider>
          <RouterProvider router={router} />
        </NotificationProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByTestId("recovery-retry"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1500));
    });
    expect(document.body.textContent?.trim()).not.toBe("");
  });

  it("keeps something on screen while a retry is pending and shows recovery again when it fails", async () => {
    let attempts = 0;
    let rejectRetry: (e: unknown) => void = () => {};
    const rootRoute = createRootRoute({ component: Outlet });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      loader: () => {
        attempts += 1;
        if (attempts === 1) return Promise.reject(new TypeError("Failed to fetch"));
        return new Promise((_, reject) => {
          rejectRetry = reject;
        });
      },
      component: () => <div>home</div>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
      defaultErrorComponent: RouteRecoveryScreen,
    });

    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <NotificationProvider>
          <RouterProvider router={router} />
        </NotificationProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByTestId("recovery-retry"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1500));
    });
    expect(container.innerHTML).not.toBe("");

    await act(async () => {
      rejectRetry(new TypeError("Failed to fetch"));
    });
    expect(await screen.findByTestId("recovery-retry")).toBeInTheDocument();
  });
});
