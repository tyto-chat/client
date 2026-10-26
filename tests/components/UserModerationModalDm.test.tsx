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
import { useConversationProfileCard } from "@/components/dm/ConversationProfileCard";

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
vi.mock("@/queries/conversationQueries", () => ({
  useCreateConversation: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

let requested: string[] = [];

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  requested = [];
  server.events.removeAllListeners();
  server.events.on("request:start", ({ request }) => {
    requested.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  server.use(
    http.get(`${BASE}/api/v1/me/blocks/2`, () =>
      HttpResponse.json({ userId: 2, blocked: false, blockable: true, inEffect: false }),
    ),
    http.get(`${BASE}/api/v1/me/blocks`, () => HttpResponse.json({ items: [] })),
  );
});

function renderCard() {
  return render(<UserModerationModal userId={2} canModerate={false} onClose={vi.fn()} />, {
    wrapper: Wrapper,
  });
}

function Host() {
  const { openProfile, profileCard } = useConversationProfileCard();
  return (
    <>
      <button onClick={() => openProfile(2)}>Target</button>
      {profileCard}
    </>
  );
}

describe("UserModerationModal without a community", () => {
  it("opens the profile card from a DM message author", async () => {
    render(<Host />, { wrapper: Wrapper });
    await userEvent.click(screen.getByText("Target"));
    expect(await screen.findByTestId("profile-block-button")).toBeInTheDocument();
  });

  it("profile card without a community shows block and report but no moderation", async () => {
    renderCard();
    expect(await screen.findByTestId("profile-block-button")).toBeInTheDocument();
    expect(screen.getByText("Report")).toBeInTheDocument();
    expect(screen.queryByTestId("mod-tab-actions")).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(requested.filter((r) => /communit|moderation/.test(r))).toEqual([]);
  });

  it("report from a DM profile targets server admins", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/api/v1/reports`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderCard();
    await userEvent.click(await screen.findByText("Report"));
    await userEvent.click(await screen.findByText("Submit report"));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ userId: 2 });
    expect(body).not.toHaveProperty("communityIdentifier");
  });

  it("action buttons wrap instead of overflowing", async () => {
    renderCard();
    const row = (await screen.findByTestId("profile-actions")) as HTMLElement;
    expect(row.className).toContain("flex-wrap");
    expect(row.innerHTML).not.toContain("whitespace-nowrap");
  });
});
