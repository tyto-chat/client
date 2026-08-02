import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../fixtures";
import { PinnedMessagesModal } from "@/components/PinnedMessagesModal";

const COMMUNITY = "comm-1";
const CHANNEL = "chan-1";
const LIST_URL = `${BASE}/api/v1/communities/${COMMUNITY}/channels/${CHANNEL}/pinned-messages`;

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));
vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({ user: mockUser }),
}));
vi.mock("@/context/TimezoneContext", () => ({
  useTimezone: () => ({ timezone: "UTC" }),
}));
// Render pinned rows as a simple stub — MessageGroup internals are covered elsewhere.
vi.mock("@/components/chat/MessageGroup", () => ({
  MessageGroup: ({ group }: { group: { msgs: Array<{ text: string | null }> } }) => (
    <div data-testid="msg">{group.msgs[0]?.text}</div>
  ),
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function pinnedMessage(id: string, text: string) {
  return {
    "@id": `/api/messages/${id}`,
    "@type": "Message",
    id,
    text,
    isDeleted: false,
    edited: false,
    createdAt: "2026-05-19T10:00:00Z",
    createdBy: mockUser,
    reactions: null,
    pageNumber: 1,
    pinned: true,
  };
}

function listResponse(items: unknown[]) {
  return HttpResponse.json({
    "@context": "/api/contexts/Message",
    "@id": LIST_URL,
    "@type": "Collection",
    "hydra:member": items,
    totalItems: items.length,
  });
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  navigateMock.mockReset();
});

describe("PinnedMessagesModal", () => {
  it("shows the empty state when there are no pinned messages", async () => {
    server.use(http.get(LIST_URL, () => listResponse([])));

    render(
      <PinnedMessagesModal
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        canPin={false}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByText(/No pinned messages yet/i)).toBeInTheDocument();
    });
  });

  it("renders pinned messages", async () => {
    server.use(
      http.get(LIST_URL, () =>
        listResponse([pinnedMessage("a", "first pinned"), pinnedMessage("b", "second pinned")]),
      ),
    );

    render(
      <PinnedMessagesModal
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        canPin={false}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByText("first pinned")).toBeInTheDocument();
    });
    expect(screen.getByText("second pinned")).toBeInTheDocument();
  });

  it("navigates to the permalink when a pinned row is clicked", async () => {
    server.use(http.get(LIST_URL, () => listResponse([pinnedMessage("a", "jump to me")])));

    render(
      <PinnedMessagesModal
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        canPin={false}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("jump to me")).toBeInTheDocument());

    await userEvent.click(screen.getByText("jump to me").closest("[role=button]")!);
    expect(navigateMock).toHaveBeenCalledWith({ to: "/m/$messageId", params: { messageId: "a" } });
  });

  it("shows an unpin button per row only when canPin is true", async () => {
    server.use(http.get(LIST_URL, () => listResponse([pinnedMessage("a", "pinned one")])));

    const { rerender } = render(
      <PinnedMessagesModal
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        canPin={false}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(screen.getByText("pinned one")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Unpin/i })).not.toBeInTheDocument();

    rerender(
      <PinnedMessagesModal
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        canPin={true}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Unpin/i })).toBeInTheDocument();
    });
  });
});
