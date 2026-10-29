import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { E2eeProvider } from "@/e2ee/E2eeContext";
import type { E2eeIdentity } from "@/e2ee/conversationSession";
import { ConversationReadOnlyBanner } from "@/components/dm/ConversationReadOnlyBanner";
import type { Conversation } from "@/types/api";

const navigate = vi.hoisted(() => vi.fn());
const createEncrypted = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("@/e2ee/conversationSession", async () => {
  const actual = await vi.importActual<typeof import("@/e2ee/conversationSession")>(
    "@/e2ee/conversationSession",
  );
  return { ...actual, createEncryptedConversation: createEncrypted };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock("@/context/NotificationContext", () => ({ useNotification: () => ({ notify: vi.fn() }) }));
vi.mock("@/queries/blockQueries", () => ({
  useUnblockUser: () => ({ mutate: vi.fn(), isPending: false }),
}));

const ME = mockUser.id;
const fakeIdentity = {
  scope: { serverOrigin: BASE, serverUserId: ME, profileId: "p" },
  onChange: () => () => undefined,
  startSync: () => () => undefined,
  handleEvent: () => Promise.resolve(),
} as unknown as E2eeIdentity;

function conversation(memberIds: number[], patch: Partial<Conversation> = {}): Conversation {
  return {
    "@id": "/api/conversations/plain-c",
    "@type": "Conversation",
    id: 50,
    identifier: "plain-c",
    encrypted: false,
    readOnly: true,
    readOnlyReason: "operator_required",
    createdAt: "",
    updatedAt: "",
    lastMessageAt: null,
    unreadCount: 0,
    members: memberIds.map((userId) => ({
      "@id": `/api/conversation_members/${userId}`,
      "@type": "ConversationMember",
      id: userId,
      userId,
      profile: { "@id": `/p/${userId}`, "@type": "UserProfile", name: `User ${userId}` },
      joinedAt: "",
      mutedUntil: null,
      lastReadAt: null,
    })) as Conversation["members"],
    ...patch,
  };
}

let conversations: Conversation[];
let preflights: string[];

function renderBanner(
  reason: Parameters<typeof ConversationReadOnlyBanner>[0]["reason"],
  target: Conversation,
  identity: E2eeIdentity | null = fakeIdentity,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ConversationReadOnlyBanner reason={reason} otherUserId={2} conversation={target} />,
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          <E2eeProvider identity={identity} capable>
            {children}
          </E2eeProvider>
        </QueryClientProvider>
      ),
    },
  );
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("jwt");
  navigate.mockReset();
  createEncrypted.mockReset();
  conversations = [];
  preflights = [];
  server.use(
    http.get(`${BASE}/api/v1/conversations`, () => HttpResponse.json(conversations)),
    http.get(`${BASE}/api/v1/conversations/preflight`, ({ request }) => {
      preflights.push(new URL(request.url).search);
      return HttpResponse.json({
        outcome: "encrypted",
        reason: null,
        refusingUserIds: [],
        unreachableUserIds: [],
        existingIdentifier: null,
      });
    }),
  );
});

describe("ConversationReadOnlyBanner", () => {
  it("banner_shown_for_operator_required_and_participant_refusal", () => {
    const { rerender } = renderBanner("operator_required", conversation([ME, 2]));
    expect(screen.getByTestId("conversation-read-only-banner")).toHaveTextContent(
      "This server now requires end-to-end encrypted direct messages",
    );
    expect(screen.getByTestId("e2ee-start-encrypted")).toBeInTheDocument();

    rerender(
      <ConversationReadOnlyBanner
        reason="participant_refuses_plain"
        otherUserId={2}
        conversation={conversation([ME, 2])}
      />,
    );
    expect(screen.getByTestId("conversation-read-only-banner")).toHaveTextContent(
      "Someone here only accepts end-to-end encrypted direct messages",
    );

    rerender(
      <ConversationReadOnlyBanner reason="unavailable" otherUserId={2} conversation={undefined} />,
    );
    expect(screen.queryByTestId("e2ee-start-encrypted")).toBeNull();
  });

  it("banner_starts_or_opens_encrypted_with_same_participants: opens an existing one", async () => {
    conversations = [conversation([2, ME], { identifier: "secret-c", encrypted: true })];
    renderBanner("operator_required", conversation([ME, 2]));

    await userEvent.click(screen.getByTestId("e2ee-start-encrypted"));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/dm/$conversationId",
        params: { conversationId: "secret-c" },
      }),
    );
    expect(createEncrypted).not.toHaveBeenCalled();
  });

  it("banner_starts_or_opens_encrypted_with_same_participants: starts a new one", async () => {
    createEncrypted.mockResolvedValue({ identifier: "new-c", encrypted: true });
    renderBanner("self_refuses", conversation([ME, 2]));

    await userEvent.click(screen.getByTestId("e2ee-start-encrypted"));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/dm/$conversationId",
        params: { conversationId: "new-c" },
      }),
    );
    expect(createEncrypted).toHaveBeenCalledWith(fakeIdentity, 2);
    expect(preflights).toEqual(["?memberUserIds%5B%5D=2"]);
  });

  it("banner_explains_unreachable_participant", async () => {
    server.use(
      http.get(`${BASE}/api/v1/conversations/preflight`, () =>
        HttpResponse.json({
          outcome: "plain_fallback",
          reason: null,
          refusingUserIds: [],
          unreachableUserIds: [2],
          existingIdentifier: null,
        }),
      ),
    );
    renderBanner("operator_required", conversation([ME, 2]));

    await userEvent.click(screen.getByTestId("e2ee-start-encrypted"));

    expect(await screen.findByTestId("e2ee-start-explanation")).toHaveTextContent(
      "User 2 cannot receive encrypted messages yet.",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("banner_explains_group_not_available", async () => {
    renderBanner("operator_required", conversation([ME, 2, 3]));

    await userEvent.click(screen.getByTestId("e2ee-start-encrypted"));

    expect(await screen.findByTestId("e2ee-start-explanation")).toHaveTextContent(
      "Encrypted group conversations are not available yet.",
    );
    expect(preflights).toEqual([]);
  });

  it("explains a device that is not set up instead of creating anything", async () => {
    renderBanner("operator_required", conversation([ME, 2]), null);

    await userEvent.click(screen.getByTestId("e2ee-start-encrypted"));

    expect(await screen.findByTestId("e2ee-start-explanation")).toHaveTextContent(
      "Set up or restore encryption on this device first.",
    );
    expect(createEncrypted).not.toHaveBeenCalled();
  });
});
