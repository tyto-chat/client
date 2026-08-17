import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";

function TestConsumer() {
  useAuthContext();
  return null;
}

function renderAuth() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("AuthContext session:expired handling", () => {
  beforeEach(() => {
    configureApiClient(BASE);
    setAccessToken("test-token");
    vi.spyOn(window.location, "replace").mockImplementation(() => {});
    server.use(
      http.get(`${BASE}/api/v1/realtime/public-token`, () =>
        HttpResponse.json({ token: null, expiresAt: null }),
      ),
      http.get(`${BASE}/api/v1/me`, () => HttpResponse.json(mockUser)),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("managed mode: skips the overlay and hard-navigates to / on session:expired", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    renderAuth();

    await waitFor(() => expect(screen.queryByText("Session expired")).not.toBeInTheDocument());

    act(() => {
      window.dispatchEvent(new CustomEvent("session:expired"));
    });

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("Session expired")).not.toBeInTheDocument();
  });

  it("web mode: still renders the expired overlay and does not hard-navigate", async () => {
    vi.stubEnv("VITE_APP_MODE", "");
    renderAuth();

    act(() => {
      window.dispatchEvent(new CustomEvent("session:expired"));
    });

    await waitFor(() => expect(screen.getByText("Session expired")).toBeInTheDocument());
    expect(window.location.replace).not.toHaveBeenCalled();
  });
});
