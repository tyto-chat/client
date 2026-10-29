import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../mocks/server";
import { memoryKeyStoreFactory } from "../../mocks/memoryKeyStore";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { Route } from "@/routes/_app/dm/$conversationId";
import { E2eeProvider } from "@/e2ee/E2eeContext";
import { LocalSecurityState } from "@/e2ee/localSecurityState";
import { PinStore } from "@/e2ee/pinStore";
import { PlainWriteRefusedError, setActiveSecurity } from "@/e2ee/admission";
import type { KeyStore, KeyStoreScope } from "@/e2ee/keyStore";
import { useConversationActivityMercure } from "@/hooks/useMercure";
import { useSendConversationMessage } from "@/queries/conversationQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { Conversation, Message } from "@/types/api";

const handlers = vi.hoisted(() => new Map<string, (event: MessageEvent) => void>());
vi.mock("@/hooks/useMercureSubscription", () => ({
  useMercureSubscription: (topic: string | null, onMessage: (event: MessageEvent) => void) => {
    if (topic !== null) handlers.set(topic, onMessage);
  },
}));
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock("@/context/AuthContext", () => ({ useAuthContext: () => ({ user: mockUser }) }));
vi.mock("@/context/NotificationContext", () => ({ useNotification: () => ({ notify: vi.fn() }) }));
vi.mock("@/context/TimezoneContext", () => ({ useTimezone: () => ({ timezone: "UTC" }) }));
vi.mock("@/queries/notificationQueries", () => ({
  useNotificationUnreadCounts: () => ({ data: { counts: { dm: 0 } } }),
}));
vi.mock("@/queries/blockQueries", () => ({
  useBlockedUserIds: () => new Set<number>(),
  useUnblockUser: () => ({ mutate: vi.fn(), isPending: false }),
  BLOCKS_LOADER_WAIT_MS: 0,
  prefetchBlockedUsers: () => Promise.resolve(),
}));
vi.mock("@/components/dm/ConversationProfileCard", () => ({
  useConversationProfileCard: () => ({ openProfile: vi.fn(), profileCard: null }),
}));
vi.mock("@/components/MobileTopBar", () => ({ MobileTopBar: () => null }));
vi.mock("@/components/chat/MessageEditor", () => ({
  MessageEditor: () => <div data-testid="editor-stub" />,
}));

const ME = mockUser.id;
const PEER = 2;
const CONV_ID = 50;
const IDENT = "plain-c";
const scope: KeyStoreScope = { serverOrigin: BASE, serverUserId: ME, profileId: "p" };

let client: QueryClient;
let store: KeyStore;
let posts: string[];
let conversationState: Conversation;
let pageMessages: Message[];

function message(id: string, text: string, revisionCount = 1): Message {
  return {
    "@id": `/api/messages/${id}`,
    "@type": "Message",
    id,
    text,
    isDeleted: false,
    edited: false,
    revisionCount,
    kind: "standard",
    createdAt: "2026-10-29T10:00:00+00:00",
    createdBy: { ...mockUser, id: PEER, "@id": `/api/users/${PEER}` },
    reactions: null,
    pageNumber: 1,
    conversationIdentifier: IDENT,
  } as Message;
}

function conversation(patch: Partial<Conversation> = {}): Conversation {
  return {
    "@id": `/api/conversations/${IDENT}`,
    "@type": "Conversation",
    id: CONV_ID,
    identifier: IDENT,
    encrypted: false,
    readOnly: false,
    readOnlyReason: null,
    createdAt: "2026-10-01T00:00:00+00:00",
    updatedAt: "2026-10-01T00:00:00+00:00",
    lastMessageAt: null,
    unreadCount: 0,
    members: [ME, PEER].map((userId) => ({
      "@id": `/api/conversation_members/${userId}`,
      "@type": "ConversationMember",
      id: userId,
      userId,
      profile: { "@id": `/api/profiles/${userId}`, "@type": "UserProfile", name: `User ${userId}` },
      joinedAt: "2026-10-01T00:00:00+00:00",
      mutedUntil: null,
      lastReadAt: null,
    })) as Conversation["members"],
    ...patch,
  };
}

function Page() {
  useConversationActivityMercure(ME);
  const Component = Route.options.component as () => ReactNode;
  return <Component />;
}

async function renderConversation(security: LocalSecurityState) {
  vi.spyOn(Route, "useParams").mockReturnValue({ conversationId: IDENT } as never);
  vi.spyOn(Route, "useLoaderData").mockReturnValue({
    latestPageNumber: 1,
    focusMessageId: null,
    initialPageNumber: 1,
  } as never);
  vi.spyOn(Route, "useSearch").mockReturnValue({} as never);
  await (Route.options.component as { preload?: () => Promise<void> }).preload?.();
  return render(<Page />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <E2eeProvider security={security} capable>
          <Suspense fallback={null}>{children}</Suspense>
        </E2eeProvider>
      </QueryClientProvider>
    ),
  });
}

function fire(topic: string, payload: unknown) {
  act(() => handlers.get(topic)?.({ data: JSON.stringify(payload) } as MessageEvent));
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("jwt");
  handlers.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  store = memoryKeyStoreFactory()();
  posts = [];
  conversationState = conversation();
  pageMessages = [message("m-old", "from before")];
  server.use(
    http.get(`${BASE}/api/v1/conversations/${IDENT}`, () => HttpResponse.json(conversationState)),
    http.get(`${BASE}/api/v1/conversations`, () => HttpResponse.json([conversationState])),
    http.get(`${BASE}/api/v1/conversations/${IDENT}/pages/1`, () =>
      HttpResponse.json({
        "@id": "p1",
        "@type": "ChannelPage",
        id: 1,
        pageNumber: 1,
        messageCount: pageMessages.length,
        prevPageId: null,
        nextPageId: null,
        messages: pageMessages,
      }),
    ),
    http.post(`${BASE}/api/v1/conversations/${IDENT}/messages`, async ({ request }) => {
      posts.push(await request.text());
      return HttpResponse.json(message("m-sent", "sent"), { status: 201 });
    }),
    http.post(`${BASE}/api/v1/conversations/${IDENT}/mark-read`, () =>
      HttpResponse.json(conversationState),
    ),
    http.get(`${BASE}/api/v1/presence`, () => HttpResponse.json({ items: [] })),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setActiveSecurity(null);
});

describe("plain conversation enforcement", () => {
  it("invented_existing_plain_conversation_with_pinned_peer_refused_on_open_and_send", async () => {
    await new PinStore(store, scope).pin(PEER, new Uint8Array(32).fill(1), 1);
    const security = await LocalSecurityState.open(store, scope);
    await renderConversation(security);

    expect(await screen.findByTestId("e2ee-refused-plain-conversation")).toBeInTheDocument();
    expect(screen.queryByText("from before")).toBeNull();
    expect(screen.queryByTestId("editor-stub")).toBeNull();
    expect(security.snapshot().acceptedPlainConversations.has(CONV_ID)).toBe(false);

    const { result } = renderHook(() => useSendConversationMessage(IDENT, mockUser), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await expect(result.current.mutateAsync({ text: "hi" })).rejects.toBeInstanceOf(
      PlainWriteRefusedError,
    );
    expect(posts).toEqual([]);
  });

  it("pre_pin_plain_conversation_accepted_on_open", async () => {
    const security = await LocalSecurityState.open(store, scope);
    await renderConversation(security);

    expect(await screen.findByText("from before")).toBeInTheDocument();
    await waitFor(() =>
      expect(security.snapshot().acceptedPlainConversations.has(CONV_ID)).toBe(true),
    );

    await new PinStore(store, scope).pin(PEER, new Uint8Array(32).fill(1), 1);
    await act(() => security.refreshPins());

    expect(screen.queryByTestId("e2ee-refused-plain-conversation")).toBeNull();
    expect(screen.getByTestId("editor-stub")).toBeInTheDocument();
  });

  it("own refusal makes the conversation read-only locally and drops new content", async () => {
    const security = await LocalSecurityState.open(store, scope);
    await security.turnRefusalOn([{ id: "m-old", revisionCount: 1 }]);
    pageMessages = [message("m-old", "from before"), message("m-new", "arrived later")];
    await renderConversation(security);

    expect(await screen.findByText("from before")).toBeInTheDocument();
    expect(screen.queryByText("arrived later")).toBeNull();
    expect(screen.getByTestId("e2ee-declined-plain")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-read-only-banner")).toHaveAttribute(
      "data-reason",
      "self_refuses",
    );
    expect(screen.queryByTestId("editor-stub")).toBeNull();

    fire(`m/${CONV_ID}`, message("m-live", "live after refusal"));
    fire(`m/${CONV_ID}`, {
      type: "message.update",
      "@id": "/api/messages/m-old",
      text: "edited after refusal",
      revisionCount: 2,
    });

    expect(screen.queryByText("live after refusal")).toBeNull();
    expect(screen.queryByText("edited after refusal")).toBeNull();
    expect(screen.getByText("from before")).toBeInTheDocument();
  });

  it("server_cannot_clear_local_refusal", async () => {
    const security = await LocalSecurityState.open(store, scope);
    await security.turnRefusalOn([]);
    conversationState = conversation({ readOnly: false, readOnlyReason: null });
    await renderConversation(security);

    expect(await screen.findByTestId("conversation-read-only-banner")).toHaveAttribute(
      "data-reason",
      "self_refuses",
    );
    fire(`u/${ME}/d`, {
      type: "conversation.policy",
      conversationIdentifier: IDENT,
      readOnly: false,
      readOnlyReason: null,
    });

    expect(screen.getByTestId("conversation-read-only-banner")).toBeInTheDocument();
    expect(security.snapshot().refusal.on).toBe(true);
  });

  it("policy_event_sets_read_only_while_connected and policy_event_lifts_read_only_while_connected", async () => {
    const security = await LocalSecurityState.open(store, scope);
    await renderConversation(security);
    await screen.findByTestId("editor-stub");

    conversationState = conversation({ readOnly: true, readOnlyReason: "operator_required" });
    fire(`u/${ME}/d`, {
      type: "conversation.policy",
      conversationIdentifier: IDENT,
      readOnly: true,
      readOnlyReason: "operator_required",
    });

    expect(await screen.findByTestId("conversation-read-only-banner")).toHaveAttribute(
      "data-reason",
      "operator_required",
    );
    expect(screen.queryByTestId("editor-stub")).toBeNull();

    conversationState = conversation();
    fire(`u/${ME}/d`, {
      type: "conversation.policy",
      conversationIdentifier: IDENT,
      readOnly: false,
      readOnlyReason: null,
    });

    expect(await screen.findByTestId("editor-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("conversation-read-only-banner")).toBeNull();
    expect(client.getQueryData<Conversation>(queryKeys.conversation(IDENT))?.readOnly).toBe(false);
  });
});
