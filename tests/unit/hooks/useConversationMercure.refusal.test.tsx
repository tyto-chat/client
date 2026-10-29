import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { setActiveSecurity } from "@/e2ee/admission";
import type { LocalSecuritySnapshot } from "@/e2ee/localSecurityState";
import { useConversationMercure, useThreadMercure } from "@/hooks/useMercure";
import { useInfiniteConversationMessages } from "@/queries/conversationQueries";
import { DeclinedContentError, useMessage } from "@/queries/messageQueries";
import { useLoadEarlierReplies, useThreadReplies } from "@/queries/threadQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { ChannelPage, Conversation, Message } from "@/types/api";

const handlers = new Map<string, (event: MessageEvent) => void>();
vi.mock("@/hooks/useMercureSubscription", () => ({
  useMercureSubscription: (topic: string | null, onMessage: (event: MessageEvent) => void) => {
    if (topic !== null) handlers.set(topic, onMessage);
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const IDENT = "plain-c";
const ROOT = "/api/messages/root";
let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

function message(id: string, patch: Partial<Message> = {}): Message {
  return {
    "@id": `/api/messages/${id}`,
    "@type": "Message",
    id,
    text: id,
    isDeleted: false,
    edited: false,
    revisionCount: 1,
    kind: "standard",
    createdAt: "2026-10-29T10:00:00+00:00",
    createdBy: { ...mockUser, id: 2 },
    reactions: null,
    pageNumber: 1,
    conversationIdentifier: IDENT,
    ...patch,
  } as Message;
}

function fire(topic: string, payload: unknown) {
  act(() => handlers.get(topic)?.({ data: JSON.stringify(payload) } as MessageEvent));
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("jwt");
  handlers.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.conversation(IDENT), {
    id: 50,
    identifier: IDENT,
    encrypted: false,
    members: [{ userId: mockUser.id }, { userId: 2 }],
  } as unknown as Conversation);
  const refusing: LocalSecuritySnapshot = {
    scope: { serverOrigin: BASE, serverUserId: mockUser.id, profileId: "p" },
    refusal: { on: true, since: 1 },
    knownBeforeRefusal: new Map([
      ["known", 1],
      ["root", 1],
    ]),
    acceptedPlainConversations: new Set(),
    pinnedUserIds: new Set(),
  };
  setActiveSecurity(refusing);
});

afterEach(() => setActiveSecurity(null));

describe("admission_called_on_every_cache_writing_path", () => {
  it("drops a new root from the conversation topic", () => {
    client.setQueryData<InfiniteData<ChannelPage>>(queryKeys.conversationPages(IDENT), {
      pages: [{ pageNumber: 1, messages: [message("known")] } as ChannelPage],
      pageParams: [1],
    });
    renderHook(() => useConversationMercure(IDENT, 50), { wrapper });

    fire("m/50", message("new"));

    const pages = client.getQueryData<InfiniteData<ChannelPage>>(
      queryKeys.conversationPages(IDENT),
    );
    expect(pages?.pages[0]?.messages?.map((m) => m.id)).toEqual(["known"]);
  });

  it("drops a new reply from the thread topic", () => {
    client.setQueryData<Message[]>(queryKeys.threadReplies(ROOT), []);
    renderHook(() => useThreadMercure(ROOT, "m/50/t", IDENT), { wrapper });

    fire("m/50/t", message("reply", { parent: message("root") }));

    expect(client.getQueryData(queryKeys.threadReplies(ROOT))).toEqual([]);
  });

  it("filters pagination, thread loads, earlier replies and single fetches", async () => {
    server.use(
      http.get(`${BASE}/api/v1/conversations/${IDENT}/pages/1`, () =>
        HttpResponse.json({
          "@id": "p1",
          "@type": "ChannelPage",
          pageNumber: 1,
          messages: [message("known"), message("later")],
        }),
      ),
      http.get(`${BASE}/api/v1/messages/root/thread`, ({ request }) =>
        HttpResponse.json({
          "@type": "Collection",
          "hydra:member": new URL(request.url).searchParams.has("before")
            ? [message("earlier-new")]
            : [message("reply-new")],
          totalItems: 1,
        }),
      ),
      http.get(`${BASE}/api/v1/messages/later`, () => HttpResponse.json(message("later"))),
    );

    const pages = renderHook(() => useInfiniteConversationMessages(IDENT, 1, 1), { wrapper });
    const thread = renderHook(() => useThreadReplies(ROOT, IDENT), { wrapper });
    const earlier = renderHook(() => useLoadEarlierReplies(ROOT, IDENT), { wrapper });
    const single = renderHook(() => useMessage("later"), { wrapper });

    await waitFor(() => expect(pages.result.current.data).toBeDefined());
    expect(pages.result.current.data?.pages[0]?.messages?.map((m) => m.id)).toEqual(["known"]);
    await waitFor(() => expect(thread.result.current.data).toEqual([]));
    await expect(earlier.result.current.mutateAsync("/api/messages/x")).resolves.toEqual([]);
    await waitFor(() => expect(single.result.current.error).toBeInstanceOf(DeclinedContentError));
  });

  it("does not filter channel threads", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/root/thread`, () =>
        HttpResponse.json({
          "@type": "Collection",
          "hydra:member": [message("channel-reply", { conversationIdentifier: null })],
          totalItems: 1,
        }),
      ),
    );

    const thread = renderHook(() => useThreadReplies(ROOT), { wrapper });

    await waitFor(() => expect(thread.result.current.data).toHaveLength(1));
  });
});
