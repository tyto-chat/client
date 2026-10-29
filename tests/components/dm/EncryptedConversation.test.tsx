import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { Route } from "@/routes/_app/dm/$conversationId";
import { ThreadPanel } from "@/components/chat/ThreadPanel";
import { E2eeProvider } from "@/e2ee/E2eeContext";
import { decodeEnvelope, encodeEnvelope } from "@/e2ee/envelope";
import { sendEncrypted, type E2eeIdentity } from "@/e2ee/conversationSession";
import { useEditConversationMessage } from "@/queries/conversationQueries";
import { useEditThreadReply } from "@/queries/threadQueries";
import type { Message } from "@/types/api";
import { encryptedHarness, ME, type EncryptedHarness } from "../../mocks/e2eeHttpHarness";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock("@/context/AuthContext", () => ({ useAuthContext: () => ({ user: mockUser }) }));
vi.mock("@/context/NotificationContext", () => ({ useNotification: () => ({ notify: vi.fn() }) }));
vi.mock("@/context/TimezoneContext", () => ({ useTimezone: () => ({ timezone: "UTC" }) }));
vi.mock("@/hooks/useMercure", () => ({
  useConversationMercure: () => undefined,
  useThreadMercure: () => undefined,
}));
vi.mock("@/queries/notificationQueries", () => ({
  useNotificationUnreadCounts: () => ({ data: { counts: { dm: 0 } } }),
}));
vi.mock("@/queries/blockQueries", () => ({
  useBlockedUserIds: () => new Set<number>(),
  BLOCKS_LOADER_WAIT_MS: 0,
  prefetchBlockedUsers: () => Promise.resolve(),
}));
vi.mock("@/components/dm/ConversationProfileCard", () => ({
  useConversationProfileCard: () => ({ openProfile: vi.fn(), profileCard: null }),
}));
vi.mock("@/components/MobileTopBar", () => ({ MobileTopBar: () => null }));
const sends = vi.hoisted(() => ({ last: null as Promise<unknown> | null }));
vi.mock("@/components/chat/MessageEditor", () => ({
  MessageEditor: ({ onSend }: { onSend: (text: string) => unknown }) => (
    <button
      data-testid="editor-stub"
      onClick={() => {
        sends.last = Promise.resolve(onSend("x".repeat(10_001)));
        sends.last.catch(() => undefined);
      }}
    >
      send
    </button>
  ),
}));

let harness: EncryptedHarness;
let client: QueryClient;

function wrapper(identity: E2eeIdentity | null, capable = true) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <E2eeProvider identity={identity} capable={capable}>
          <Suspense fallback={<div data-testid="suspended" />}>{children}</Suspense>
        </E2eeProvider>
      </QueryClientProvider>
    );
  };
}

async function renderConversation(identity: E2eeIdentity | null, capable = true) {
  vi.spyOn(Route, "useParams").mockReturnValue({
    conversationId: harness.conversation.identifier,
  } as never);
  vi.spyOn(Route, "useLoaderData").mockReturnValue({
    latestPageNumber: 1,
    focusMessageId: null,
    initialPageNumber: 1,
  } as never);
  vi.spyOn(Route, "useSearch").mockReturnValue({} as never);
  const Page = Route.options.component as (() => ReactNode) & { preload?: () => Promise<void> };
  await Page.preload?.();
  return render(<Page />, { wrapper: wrapper(identity, capable) });
}

async function fromPeer(text: string): Promise<Message> {
  const sent = await sendEncrypted(harness.peer.session(harness.conversation), text);
  return harness.delivery.message(sent.id);
}

beforeEach(async () => {
  configureApiClient(BASE);
  setAccessToken("jwt");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  harness = await encryptedHarness(BASE);
  server.use(
    http.get(`${BASE}/api/v1/me/blocks`, () => HttpResponse.json({ items: [] })),
    http.get(`${BASE}/api/v1/presence`, () => HttpResponse.json({ items: [] })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("encrypted conversation view", () => {
  it("encrypted_view_keeps_reactions_and_reply and hides report, search and embed", async () => {
    await fromPeer("hello from the peer");
    await renderConversation(harness.me);

    const body = await screen.findByText("hello from the peer");
    expect(screen.getByTestId("dm-e2ee-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("dm-search-button")).toBeNull();
    const row = body.closest("[data-message-id]") as HTMLElement;
    fireEvent.mouseEnter(row);
    const actions = await within(row).findByTestId("msg-actions-row");
    expect(within(actions).getByTestId("msg-action-reply")).toBeInTheDocument();
    expect(within(actions).getByTitle("Add reaction")).toBeInTheDocument();
    expect(within(actions).queryByTestId("msg-action-report")).toBeNull();
    expect(within(actions).queryByTestId("msg-action-embed")).toBeNull();
  });

  it("a failed encrypted send rejects so the composer keeps the draft", async () => {
    await renderConversation(harness.me);

    fireEvent.click(await screen.findByTestId("editor-stub"));

    await expect(sends.last).rejects.toBeDefined();
  });

  it("unreadable_messages_show_notice", async () => {
    const message = await fromPeer("secret");
    const envelope = decodeEnvelope(message.text);
    if (envelope === null) throw new Error("no envelope");
    harness.delivery.putMessage({ ...message, text: encodeEnvelope({ ...envelope, g: 7 }) });
    await renderConversation(harness.me);

    expect(await screen.findByTestId("e2ee-unreadable")).toBeInTheDocument();
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("tampered_messages_show_notice_not_content", async () => {
    const message = await fromPeer("really from the peer");
    harness.delivery.putMessage({
      ...message,
      createdBy: { ...message.createdBy, id: ME } as Message["createdBy"],
    });
    await renderConversation(harness.me);

    expect(await screen.findByTestId("e2ee-tampered")).toBeInTheDocument();
    expect(screen.queryByText("really from the peer")).toBeNull();
  });

  it("web_shows_placeholder", async () => {
    await fromPeer("you cannot see me");
    await renderConversation(null, false);

    expect(await screen.findByTestId("e2ee-unavailable")).toHaveTextContent(
      "Open the tyto.chat desktop app",
    );
    expect(screen.queryByText("you cannot see me")).toBeNull();
  });

  it("unrestored desktop shows the restore placeholder", async () => {
    await renderConversation(null, true);

    expect(await screen.findByTestId("e2ee-unavailable")).toHaveTextContent(
      "Set up or restore encryption",
    );
  });

  it("thread_panel_decrypts_replies", async () => {
    const root = await fromPeer("the root");
    await sendEncrypted(harness.peer.session(harness.conversation), "a secret reply", root["@id"]);

    render(
      <ThreadPanel
        conversationIdentifier={harness.conversation.identifier}
        conversationNumericId={harness.conversation.id}
        rootIri={root["@id"]}
        members={[]}
        channels={[]}
        allowAttachments={false}
        onClose={vi.fn()}
        renderPolicy="encrypted"
        e2eeSession={harness.me.session(harness.conversation)}
      />,
      { wrapper: wrapper(harness.me) },
    );

    expect(await screen.findByText("a secret reply")).toBeInTheDocument();
    expect(await screen.findByText("the root")).toBeInTheDocument();
  });

  it("root_edit_in_encrypted_dm_sends_envelope_only", async () => {
    const session = harness.me.session(harness.conversation);
    const mine = await sendEncrypted(session, "first draft");
    const { result } = renderHook(
      () => useEditConversationMessage(harness.conversation.identifier, session),
      { wrapper: wrapper(harness.me) },
    );

    await result.current.mutateAsync({ messageIri: mine["@id"], text: "secret correction" });

    const patch = harness.bodies.find((b) => b.method === "PATCH");
    expect(JSON.parse(patch?.body ?? "{}").text).toMatch(/^e2ee:1:/);
    expect(patch?.body).not.toContain("secret correction");
  });

  it("thread_reply_edit_in_encrypted_dm_sends_envelope_only", async () => {
    const session = harness.me.session(harness.conversation);
    const root = await sendEncrypted(session, "root");
    const reply = await sendEncrypted(session, "reply", root["@id"]);
    const { result } = renderHook(() => useEditThreadReply(root["@id"], session), {
      wrapper: wrapper(harness.me),
    });

    await result.current.mutateAsync({ messageIri: reply["@id"], text: "secret reply edit" });

    const patch = harness.bodies.find((b) => b.method === "PATCH");
    expect(JSON.parse(patch?.body ?? "{}").text).toMatch(/^e2ee:1:/);
    expect(patch?.body).not.toContain("secret reply edit");
    await waitFor(() => expect(harness.delivery.message(reply.id).revisionCount).toBe(2));
  });
});
