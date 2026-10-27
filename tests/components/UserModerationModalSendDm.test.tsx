import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { ApiError, configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../fixtures";
import { UserModerationModal } from "@/components/UserModerationModal";

const mocks = vi.hoisted(() => ({ notify: vi.fn(), mutateAsync: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, roles: ["ROLE_USER"] } }),
}));
vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: mocks.notify }),
}));
vi.mock("@/context/TimezoneContext", () => ({ useTimezone: () => ({ timezone: "UTC" }) }));
vi.mock("@/queries/userQueries", () => ({
  useUser: () => ({
    data: { profile: { "@id": "/api/profiles/2", name: "Target", avatar: null }, isAdmin: false },
    isLoading: false,
  }),
}));
vi.mock("@/queries/conversationQueries", () => ({
  useCreateConversation: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
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

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  mocks.notify.mockReset();
  mocks.mutateAsync.mockReset();
  server.use(
    http.get(`${BASE}/api/v1/me/blocks/2`, () =>
      HttpResponse.json({ userId: 2, blocked: false, blockable: true, inEffect: true }),
    ),
    http.get(`${BASE}/api/v1/me/blocks`, () => HttpResponse.json({ items: [] })),
  );
});

describe("UserModerationModal Send DM", () => {
  it("shows the server's reason when the conversation cannot be created", async () => {
    mocks.mutateAsync.mockRejectedValue(
      new ApiError(403, { error: "You cannot message this user." }),
    );
    render(<UserModerationModal userId={2} canModerate={false} onClose={vi.fn()} />, {
      wrapper: Wrapper,
    });

    await userEvent.click(await screen.findByText("Message"));

    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith("You cannot message this user.", "error"),
    );
  });
});
