import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../fixtures";
import { UserModerationModal } from "@/components/UserModerationModal";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), onClose: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, roles: ["ROLE_USER"] } }),
}));
vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));
vi.mock("@/context/TimezoneContext", () => ({ useTimezone: () => ({ timezone: "UTC" }) }));
vi.mock("@/queries/userQueries", () => ({
  useUser: () => ({
    data: { profile: { "@id": "/api/profiles/2", name: "Target", avatar: null }, isAdmin: false },
    isLoading: false,
  }),
}));
vi.mock("@/queries/presenceQueries", () => ({
  usePresenceSubscription: () => undefined,
  useUserPresence: () => "offline",
}));

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

let created = false;

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  mocks.navigate.mockReset();
  mocks.onClose.mockReset();
  created = false;
  server.use(
    http.get(`${BASE}/api/v1/me/blocks/2`, () =>
      HttpResponse.json({ userId: 2, blocked: false, blockable: true, inEffect: true }),
    ),
    http.get(`${BASE}/api/v1/me/blocks`, () => HttpResponse.json({ items: [] })),
    http.post(`${BASE}/api/v1/conversations`, () => {
      created = true;
      return HttpResponse.json({});
    }),
  );
});

describe("UserModerationModal Send DM", () => {
  it("send_dm_from_profile_opens_compose_with_recipient_and_creates_nothing", async () => {
    render(<UserModerationModal userId={2} canModerate={false} onClose={mocks.onClose} />, {
      wrapper: Wrapper,
    });

    await userEvent.click(await screen.findByText("Message"));

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dm/new", search: { to: 2 } }),
    );
    expect(mocks.onClose).toHaveBeenCalled();
    expect(created).toBe(false);
  });
});
