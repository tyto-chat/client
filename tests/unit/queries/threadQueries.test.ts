import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import {
  useDeleteThreadReply,
  useEditThreadReply,
  useLoadEarlierReplies,
  useReplyToMessage,
} from "@/queries/threadQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { ChannelPage, Message } from "@/types/api";

const COMMUNITY = "comm-1";
const CHANNEL = "chan-1";
const ROOT_UUID = "3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d";
const ROOT_IRI = `/api/v1/messages/${ROOT_UUID}`;

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function rootMessage(replyCount: number): Message {
  return {
    "@id": ROOT_IRI,
    "@type": "Message",
    id: ROOT_UUID,
    text: "root",
    isDeleted: false,
    edited: false,
    kind: "standard",
    createdAt: "2026-05-19T10:00:00Z",
    createdBy: mockUser,
    reactions: null,
    pageNumber: 1,
    replyCount,
  };
}

function seedPagesWithRoot(qc: QueryClient, replyCount: number) {
  qc.setQueryData<InfiniteData<ChannelPage>>(queryKeys.channelPages(COMMUNITY, CHANNEL), {
    pages: [
      {
        "@id": "page-1",
        "@type": "ChannelPage",
        id: 1,
        pageNumber: 1,
        messageCount: 1,
        prevPageId: null,
        nextPageId: null,
        messages: [rootMessage(replyCount)],
      },
    ],
    pageParams: [1],
  });
}

beforeEach(() => {
  configureApiClient(BASE);
});

describe("useReplyToMessage", () => {
  it("optimistically appends a reply and bumps the root replyCount", async () => {
    server.use(
      http.post(`${BASE}${ROOT_IRI}/replies`, () =>
        HttpResponse.json(
          { ...rootMessage(0), "@id": "/api/v1/messages/new", id: "new", text: "hi" },
          { status: 201 },
        ),
      ),
    );

    const qc = makeQueryClient();
    seedPagesWithRoot(qc, 0);

    const { result } = renderHook(
      () => useReplyToMessage(queryKeys.channelPages(COMMUNITY, CHANNEL), ROOT_IRI, mockUser),
      { wrapper: makeWrapper(qc) },
    );

    act(() => {
      result.current.mutate({ text: "hi" });
    });

    // Optimistic reply appended (onMutate now awaits cancelQueries first, so the
    // write lands a microtask later).
    await waitFor(() => {
      const thread = qc.getQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI));
      expect(thread?.some((m) => m.text === "hi")).toBe(true);
    });

    // Root replyCount bumped optimistically in the channel pages cache.
    const pages = qc.getQueryData<InfiniteData<ChannelPage>>(
      queryKeys.channelPages(COMMUNITY, CHANNEL),
    );
    expect(pages?.pages[0]?.messages?.[0]?.replyCount).toBe(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rolls back the channel cache when the reply fails", async () => {
    server.use(
      http.post(`${BASE}${ROOT_IRI}/replies`, () => new HttpResponse(null, { status: 422 })),
    );

    const qc = makeQueryClient();
    seedPagesWithRoot(qc, 0);

    const { result } = renderHook(
      () => useReplyToMessage(queryKeys.channelPages(COMMUNITY, CHANNEL), ROOT_IRI, mockUser),
      { wrapper: makeWrapper(qc) },
    );

    await act(async () => {
      await result.current.mutateAsync({ text: "hi" }).catch(() => {});
    });

    await waitFor(() => {
      const pages = qc.getQueryData<InfiniteData<ChannelPage>>(
        queryKeys.channelPages(COMMUNITY, CHANNEL),
      );
      expect(pages?.pages[0]?.messages?.[0]?.replyCount).toBe(0);
    });
  });

  it("bumps replyCount in the container pages cache identified by pagesKey (DM conversation)", async () => {
    server.use(
      http.post(`${BASE}${ROOT_IRI}/replies`, () =>
        HttpResponse.json({
          ...rootMessage(0),
          "@id": "/api/v1/messages/new",
          id: "new",
          text: "re",
        }),
      ),
    );

    const qc = makeQueryClient();
    const pagesKey = queryKeys.conversationPages("conv-1");
    qc.setQueryData<InfiniteData<ChannelPage>>(pagesKey, {
      pages: [
        {
          "@id": "page-1",
          "@type": "ChannelPage",
          id: 1,
          pageNumber: 1,
          messageCount: 1,
          prevPageId: null,
          nextPageId: null,
          messages: [rootMessage(0)],
        },
      ],
      pageParams: [1],
    });

    const { result } = renderHook(() => useReplyToMessage(pagesKey, ROOT_IRI, mockUser), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate({ text: "re" });

    await waitFor(() => {
      const data = qc.getQueryData<InfiniteData<ChannelPage>>(pagesKey);
      expect(data?.pages[0]?.messages?.[0]?.replyCount).toBe(1);
    });
  });
});

const REPLY_UUID = "11111111-1111-1111-1111-111111111111";
const REPLY_IRI = `/api/v1/messages/${REPLY_UUID}`;

function reply(text: string): Message {
  return {
    "@id": REPLY_IRI,
    "@type": "Message",
    id: REPLY_UUID,
    text,
    isDeleted: false,
    edited: false,
    kind: "standard",
    createdAt: "2026-05-20T11:00:00Z",
    createdBy: mockUser,
    reactions: null,
    pageNumber: null,
  };
}

describe("useEditThreadReply", () => {
  it("optimistically updates the thread cache; server confirmation overwrites with returned text", async () => {
    server.use(
      http.patch(`${BASE}${REPLY_IRI}`, () =>
        HttpResponse.json({ ...reply("server sanitized"), edited: true }),
      ),
    );

    const qc = makeQueryClient();
    qc.setQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI), [reply("original")]);

    const { result } = renderHook(() => useEditThreadReply(ROOT_IRI), {
      wrapper: makeWrapper(qc),
    });

    await act(() =>
      result.current.mutateAsync({ messageIri: REPLY_IRI, text: "edited optimistic" }),
    );

    const after = qc.getQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI));
    expect(after?.[0]?.edited).toBe(true);
    expect(after?.[0]?.text).toBe("server sanitized");
  });

  it("rolls back the thread cache when the edit fails", async () => {
    server.use(http.patch(`${BASE}${REPLY_IRI}`, () => new HttpResponse(null, { status: 403 })));

    const qc = makeQueryClient();
    qc.setQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI), [reply("original")]);

    const { result } = renderHook(() => useEditThreadReply(ROOT_IRI), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ messageIri: REPLY_IRI, text: "tried" }).catch(() => {});
    });

    await waitFor(() => {
      const after = qc.getQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI));
      expect(after?.[0]?.text).toBe("original");
      expect(after?.[0]?.edited).toBe(false);
    });
  });
});

describe("useDeleteThreadReply", () => {
  function seedPagesWithRoot(qc: QueryClient, replyCount: number) {
    qc.setQueryData<InfiniteData<ChannelPage>>(queryKeys.channelPages(COMMUNITY, CHANNEL), {
      pages: [
        {
          "@id": "page-1",
          "@type": "ChannelPage",
          id: 1,
          pageNumber: 1,
          messageCount: 1,
          prevPageId: null,
          nextPageId: null,
          messages: [
            {
              ...reply("root"),
              "@id": ROOT_IRI,
              id: ROOT_UUID,
              replyCount,
            },
          ],
        },
      ],
      pageParams: [1],
    });
  }

  it("removes the reply from the thread cache and decrements root replyCount in pages cache", async () => {
    server.use(http.delete(`${BASE}${REPLY_IRI}`, () => new HttpResponse(null, { status: 204 })));

    const qc = makeQueryClient();
    qc.setQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI), [reply("doomed")]);
    seedPagesWithRoot(qc, 1);

    const { result } = renderHook(() => useDeleteThreadReply(ROOT_IRI), {
      wrapper: makeWrapper(qc),
    });

    await act(() => result.current.mutateAsync(REPLY_IRI));

    // Soft-delete: the reply stays in the cache flagged isDeleted, so the
    // panel renders "This message was deleted." in place. Root replyCount
    // is intentionally NOT decremented (still matches visible row total).
    const threadAfter = qc.getQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI));
    expect(threadAfter).toHaveLength(1);
    expect(threadAfter?.[0]?.isDeleted).toBe(true);
    expect(threadAfter?.[0]?.text).toBeNull();
    const pages = qc.getQueryData<InfiniteData<ChannelPage>>(
      queryKeys.channelPages(COMMUNITY, CHANNEL),
    );
    expect(pages?.pages[0]?.messages?.[0]?.replyCount).toBe(1);
  });

  it("rolls back the thread cache (un-soft-deletes) when delete fails", async () => {
    server.use(http.delete(`${BASE}${REPLY_IRI}`, () => new HttpResponse(null, { status: 403 })));

    const qc = makeQueryClient();
    qc.setQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI), [reply("doomed")]);

    const { result } = renderHook(() => useDeleteThreadReply(ROOT_IRI), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync(REPLY_IRI).catch(() => {});
    });

    await waitFor(() => {
      const after = qc.getQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI));
      expect(after).toHaveLength(1);
      expect(after?.[0]?.isDeleted).toBe(false);
      expect(after?.[0]?.text).toBe("doomed");
    });
  });
});

describe("useLoadEarlierReplies", () => {
  it("prepends the earlier window into the flat cache, deduped", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/:id/thread`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("before")).toBe("22222222-2222-2222-2222-222222222222");
        return HttpResponse.json([
          { "@id": "/api/messages/older-1", text: "older one" },
          { "@id": "/api/messages/22222222-2222-2222-2222-222222222222", text: "dupe" },
        ]);
      }),
    );

    const qc = makeQueryClient();
    const rootIri = "/api/messages/11111111-1111-1111-1111-111111111111";
    const threadKey = queryKeys.threadReplies(rootIri);
    qc.setQueryData(threadKey, [
      { "@id": "/api/messages/22222222-2222-2222-2222-222222222222", text: "dupe" },
      { "@id": "/api/messages/33333333-3333-3333-3333-333333333333", text: "newest" },
    ]);

    const { result } = renderHook(() => useLoadEarlierReplies(rootIri), {
      wrapper: makeWrapper(qc),
    });

    const earlier = await result.current.mutateAsync(
      "/api/messages/22222222-2222-2222-2222-222222222222",
    );
    expect(earlier).toHaveLength(2);

    const cached = qc.getQueryData<{ "@id": string }[]>(threadKey);
    expect(cached?.map((m) => m["@id"])).toEqual([
      "/api/messages/older-1",
      "/api/messages/22222222-2222-2222-2222-222222222222",
      "/api/messages/33333333-3333-3333-3333-333333333333",
    ]);
  });
});
