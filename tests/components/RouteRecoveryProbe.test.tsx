import type React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
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

function renderFailingIndex(
  loader: () => Promise<unknown>,
  Component: () => React.ReactNode = () => <div>home</div>,
) {
  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    loader,
    component: Component,
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
}

describe("RouteRecoveryScreen probe", () => {
  afterEach(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  });

  it("keeps the recovery card and skips the reload while the server is down", async () => {
    configureApiClient(BASE);
    server.use(http.get(`${BASE}/api/v1/server-info`, () => HttpResponse.error()));
    const loader = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    renderFailingIndex(loader);

    fireEvent.click(await screen.findByTestId("recovery-retry"));

    await waitFor(() => expect(screen.getByTestId("recovery-retry")).not.toBeDisabled());
    expect(screen.getByTestId("route-recovery")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Still not working.");
  });

  it("reloads the route once the server answers", async () => {
    configureApiClient(BASE);
    server.use(http.get(`${BASE}/api/v1/server-info`, () => HttpResponse.json({})));
    let attempts = 0;
    renderFailingIndex(() => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve();
    });

    fireEvent.click(await screen.findByTestId("recovery-retry"));

    expect(await screen.findByText("home")).toBeInTheDocument();
  });

  it("keeps the recovery card while the reload is still running", async () => {
    configureApiClient(BASE);
    server.use(http.get(`${BASE}/api/v1/server-info`, () => HttpResponse.json({})));
    let attempts = 0;
    let finish: () => void = () => {};
    renderFailingIndex(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new TypeError("Failed to fetch"))
        : new Promise<void>((resolve) => {
            finish = resolve;
          });
    });

    fireEvent.click(await screen.findByTestId("recovery-retry"));
    await waitFor(() => expect(attempts).toBe(2));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(screen.getByTestId("route-recovery")).toBeInTheDocument();
    expect(screen.getByTestId("recovery-retry")).toBeDisabled();

    await act(async () => finish());
    expect(await screen.findByText("home")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stays on the recovery card when the reload fails again", async () => {
    configureApiClient(BASE);
    server.use(http.get(`${BASE}/api/v1/server-info`, () => HttpResponse.json({})));
    let attempts = 0;
    renderFailingIndex(() => {
      attempts += 1;
      return attempts < 3
        ? Promise.reject(new TypeError(`attempt ${attempts}`))
        : Promise.resolve();
    });

    fireEvent.click(await screen.findByTestId("recovery-retry"));
    await waitFor(() => expect(screen.getByTestId("recovery-retry")).not.toBeDisabled());
    expect(screen.getByTestId("recovery-detail")).toHaveTextContent("attempt 2");
    expect(screen.getByRole("alert")).toHaveTextContent("Still not working.");

    fireEvent.click(screen.getByTestId("recovery-retry"));
    expect(await screen.findByText("home")).toBeInTheDocument();
  });

  it("shows a failure toast after every failed retry", async () => {
    configureApiClient(BASE);
    server.use(http.get(`${BASE}/api/v1/server-info`, () => HttpResponse.error()));
    renderFailingIndex(() => Promise.reject(new TypeError("Failed to fetch")));

    for (let i = 1; i <= 2; i++) {
      fireEvent.click(await screen.findByTestId("recovery-retry"));
      await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(i));
      await waitFor(() => expect(screen.getByTestId("recovery-retry")).not.toBeDisabled());
    }
  });

  it("shows a failure toast when the page itself keeps crashing after a reload", async () => {
    configureApiClient(BASE);
    server.use(http.get(`${BASE}/api/v1/server-info`, () => HttpResponse.json({})));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderFailingIndex(
      () => Promise.resolve(),
      () => {
        throw new TypeError("render crash");
      },
    );

    for (let i = 1; i <= 2; i++) {
      fireEvent.click(await screen.findByTestId("recovery-retry"));
      await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(i));
      await waitFor(() => expect(screen.getByTestId("recovery-retry")).not.toBeDisabled());
    }
  });
});
