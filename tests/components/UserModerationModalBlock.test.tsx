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

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
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
vi.mock("@/queries/communityQueries", () => ({ useCommunity: () => ({ data: undefined }) }));
vi.mock("@/queries/membershipQueries", () => ({
  useCommunityMembership: () => ({ data: undefined }),
}));
vi.mock("@/queries/conversationQueries", () => ({
  useCreateConversation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/queries/presenceQueries", () => ({
  usePresenceSubscription: () => undefined,
  useUserPresence: () => "offline",
}));
vi.mock("@/queries/moderationQueries", () => ({
  useActiveModeration: () => ({ data: [] }),
  useCreateModerationAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLiftModerationAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useModerationLog: () => ({ data: undefined }),
  useModeratorNotes: () => ({ data: [] }),
  useCreateModeratorNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateModeratorNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteModeratorNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

let statusServed = false;

function mockStatus(status: { blocked: boolean; blockable: boolean }) {
  statusServed = false;
  server.use(
    http.get(`${BASE}/api/v1/me/blocks/2`, () => {
      statusServed = true;
      return HttpResponse.json({ userId: 2, inEffect: status.blocked, ...status });
    }),
    http.get(`${BASE}/api/v1/me/blocks`, () => HttpResponse.json({ items: [] })),
  );
}

function renderModal() {
  return render(
    <UserModerationModal
      userId={2}
      communityId="c1"
      canModerate={false}
      callerIsChannelMod={false}
      currentChannelId="ch1"
      onClose={vi.fn()}
    />,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
});

describe("UserModerationModal block actions", () => {
  it("shows Block for a blockable user and confirms before blocking", async () => {
    mockStatus({ blocked: false, blockable: true });
    let posted: unknown = null;
    server.use(
      http.post(`${BASE}/api/v1/me/blocks`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({
          userId: 2,
          name: "Target",
          avatarUrl: null,
          blockedAt: "2026-10-26T00:00:00Z",
          inEffect: true,
        });
      }),
    );
    renderModal();
    await userEvent.click(await screen.findByTestId("profile-block-button"));
    expect(await screen.findByText("Block Target?")).toBeInTheDocument();
    expect(posted).toBeNull();
    await userEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(posted).toEqual({ userId: 2 }));
  });

  it("hides Block for staff", async () => {
    mockStatus({ blocked: false, blockable: false });
    renderModal();
    await waitFor(() => expect(statusServed).toBe(true));
    await screen.findByText("Message");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("profile-block-button")).toBeNull();
    expect(screen.queryByTestId("profile-unblock-button")).toBeNull();
  });

  it("shows Unblock and hides Send DM when blocked", async () => {
    mockStatus({ blocked: true, blockable: true });
    renderModal();
    expect(await screen.findByTestId("profile-unblock-button")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-block-button")).toBeNull();
    expect(screen.queryByText("Message")).toBeNull();
  });
});
