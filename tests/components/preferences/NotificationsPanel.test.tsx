import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { NotificationsPanel } from "@/components/preferences/NotificationsPanel";

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({ user: mockUser, refreshUser: vi.fn() }),
}));
vi.mock("@/api/users", () => ({
  setEmailNotifications: vi.fn().mockResolvedValue({ emailNotifications: true }),
}));
vi.mock("@/utils/webPush", () => ({
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  server.use(
    http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
      const patch = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        resumeLastLocation: true,
        updatedAt: "2026-07-20T00:00:00Z",
        ...patch,
      });
    }),
  );
});

describe("NotificationsPanel", () => {
  it("renders the email notifications switch and the channel-levels pointer", () => {
    render(<NotificationsPanel />, { wrapper: makeWrapper() });
    expect(screen.getByText("Daily email summary")).toBeInTheDocument();
    expect(screen.getAllByText("Channel notification levels").length).toBeGreaterThan(0);
    expect(screen.getByText("in channel list")).toBeInTheDocument();
  });

  it("toggles the email switch on click", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<NotificationsPanel />, { wrapper: makeWrapper() });
    const toggles = screen.getAllByRole("switch");
    const emailToggle = toggles[toggles.length - 1]!;
    expect(emailToggle).toHaveAttribute("aria-checked", "false");
    await userEvent.setup().click(emailToggle);
    expect(emailToggle).toHaveAttribute("aria-checked", "true");
  });
});
