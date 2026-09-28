import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { NotificationsPanel } from "@/components/preferences/NotificationsPanel";

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({ user: mockUser, refreshUser: vi.fn() }),
}));
vi.mock("@/utils/webPush", () => ({
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

const setEnabled = vi.fn();
vi.mock("@/utils/desktopNotifications", () => ({
  getDesktopNotificationsEnabled: () => true,
  getNotificationPermission: () => "granted",
  isDesktopNotificationsSupported: () => true,
  requestNotificationPermission: vi.fn().mockResolvedValue("granted"),
  setDesktopNotificationsEnabled: (value: boolean) => setEnabled(value),
}));

let patchBodies: unknown[];

beforeEach(() => {
  patchBodies = [];
  setEnabled.mockClear();
  configureApiClient(BASE);
  setAccessToken("test-token");
  server.use(
    http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      patchBodies.push(body);
      return HttpResponse.json({ updatedAt: "2026-07-20T00:00:00Z", ...body });
    }),
  );
});

afterEach(() => vi.unstubAllEnvs());

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NotificationsPanel />
    </QueryClientProvider>,
  );
}

async function turnDesktopOff() {
  const desktopToggle = screen.getAllByRole("switch")[0]!;
  expect(desktopToggle).toHaveAttribute("aria-checked", "true");
  await userEvent.setup().click(desktopToggle);
  expect(setEnabled).toHaveBeenCalledWith(false);
}

describe("NotificationsPanel desktop toggle", () => {
  it("saves the toggle to the server in web mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "web");
    renderPanel();
    await turnDesktopOff();
    await waitFor(() => expect(patchBodies).toEqual([{ desktopNotifications: false }]));
  });

  it("keeps the toggle on the device in managed mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    renderPanel();
    await turnDesktopOff();
    await new Promise((r) => setTimeout(r, 50));
    expect(patchBodies).toEqual([]);
  });
});
