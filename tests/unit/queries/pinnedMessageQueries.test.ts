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
import { usePinMessage, useUnpinMessage } from "@/queries/pinnedMessageQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { ChannelPage, Message } from "@/types/api";

const COMMUNITY = "comm-1";
const CHANNEL = "chan-1";
const UUID = "3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d";
const IRI = `/api/v1/messages/${UUID}`;

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

function seededMessage(overrides: Partial<Message> = {}): Message {
  return {
    "@id": IRI,
    "@type": "Message",
    id: UUID,
    text: "hello",
    isDeleted: false,
    edited: false,
    kind: "standard",
    createdAt: "2026-05-19T10:00:00Z",
    createdBy: mockUser,
    reactions: null,
    pageNumber: 1,
    ...overrides,
  };
}

function seedPages(queryClient: QueryClient, message: Message) {
  queryClient.setQueryData<InfiniteData<ChannelPage>>(queryKeys.channelPages(COMMUNITY, CHANNEL), {
    pages: [
      {
        "@id": "page-1",
        "@type": "ChannelPage",
        id: 1,
        pageNumber: 1,
        messageCount: 1,
        prevPageId: null,
        nextPageId: null,
        messages: [message],
      },
    ],
    pageParams: [1],
  });
}

beforeEach(() => {
  configureApiClient(BASE);
});

describe("usePinMessage", () => {
  it("optimistically marks the message pinned in the pages cache", async () => {
    server.use(
      http.post(`${BASE}${IRI}/pin`, () => HttpResponse.json(seededMessage({ pinned: true }))),
    );

    const queryClient = makeQueryClient();
    seedPages(queryClient, seededMessage());

    const { result } = renderHook(() => usePinMessage(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    await act(() => result.current.mutateAsync(IRI));

    const pages = queryClient.getQueryData<InfiniteData<ChannelPage>>(
      queryKeys.channelPages(COMMUNITY, CHANNEL),
    );
    expect(pages?.pages[0]?.messages?.[0]?.pinned).toBe(true);
  });

  it("rolls back the pages cache when the request fails", async () => {
    server.use(http.post(`${BASE}${IRI}/pin`, () => new HttpResponse(null, { status: 422 })));

    const queryClient = makeQueryClient();
    seedPages(queryClient, seededMessage());

    const { result } = renderHook(() => usePinMessage(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(IRI).catch(() => {});
    });

    await waitFor(() => {
      const pages = queryClient.getQueryData<InfiniteData<ChannelPage>>(
        queryKeys.channelPages(COMMUNITY, CHANNEL),
      );
      expect(pages?.pages[0]?.messages?.[0]?.pinned).toBeFalsy();
    });
  });
});

describe("useUnpinMessage", () => {
  it("optimistically removes the message from the pinned list", async () => {
    server.use(http.delete(`${BASE}${IRI}/pin`, () => new HttpResponse(null, { status: 204 })));

    const queryClient = makeQueryClient();
    seedPages(queryClient, seededMessage({ pinned: true }));
    queryClient.setQueryData<Message[]>(queryKeys.pinnedMessages(COMMUNITY, CHANNEL), [
      seededMessage({ pinned: true }),
    ]);

    const { result } = renderHook(() => useUnpinMessage(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    await act(() => result.current.mutateAsync(IRI));

    const pinned = queryClient.getQueryData<Message[]>(
      queryKeys.pinnedMessages(COMMUNITY, CHANNEL),
    );
    expect(pinned).toEqual([]);

    const pages = queryClient.getQueryData<InfiniteData<ChannelPage>>(
      queryKeys.channelPages(COMMUNITY, CHANNEL),
    );
    expect(pages?.pages[0]?.messages?.[0]?.pinned).toBe(false);
  });
});
