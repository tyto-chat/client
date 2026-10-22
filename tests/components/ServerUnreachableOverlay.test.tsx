import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { ServerUnreachableOverlay } from "@/components/ServerUnreachableOverlay";
import { NotificationProvider } from "@/context/NotificationContext";
import { configureApiClient } from "@/api/client";
import { recordNetworkFailure, recordNetworkSuccess } from "@/api/reachability";
import { TEST_BASE_URL as BASE } from "../fixtures";

const navigate = vi.fn(() => Promise.resolve());

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate, state: { location: { href: "/c/general" }, matches: [] } }),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ token: null, logout: vi.fn() }),
}));

function markUnreachable() {
  act(() => {
    for (let i = 0; i < 3; i++) recordNetworkFailure();
  });
}

function renderOverlay(queryClient = new QueryClient()) {
  render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <ServerUnreachableOverlay />
      </NotificationProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("ServerUnreachableOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureApiClient(BASE);
    recordNetworkSuccess();
  });

  it("stays hidden while the server is reachable", () => {
    renderOverlay();
    expect(screen.queryByTestId("server-unreachable")).toBeNull();
  });

  it("appears once the server is unreachable", () => {
    renderOverlay();
    markUnreachable();
    expect(screen.getByTestId("server-unreachable")).toBeInTheDocument();
    expect(screen.getByTestId("auth-error")).toHaveTextContent("Can't reach the server.");
  });

  it("probes the server and refetches everything when it answers", async () => {
    server.use(http.get(`${BASE}/api/v1/server-info`, () => HttpResponse.json({})));
    const queryClient = renderOverlay();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    markUnreachable();

    fireEvent.click(screen.getByTestId("recovery-retry"));

    await waitFor(() => expect(screen.queryByTestId("server-unreachable")).toBeNull());
    expect(invalidateQueries).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ href: "/c/general", replace: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stays up when the probe fails", async () => {
    server.use(http.get(`${BASE}/api/v1/server-info`, () => HttpResponse.error()));
    renderOverlay();
    markUnreachable();

    fireEvent.click(screen.getByTestId("recovery-retry"));

    await waitFor(() => expect(screen.getByTestId("recovery-retry")).not.toBeDisabled());
    expect(screen.getByTestId("server-unreachable")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Still not working.");
  });
});
