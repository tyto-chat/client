import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createContext, useContext, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useChannelMercure } from "@/hooks/useMercure";
import { queryKeys } from "@/queries/queryKeys";
import type { useAuthContext } from "@/context/AuthContext";
import type { useNotification } from "@/context/NotificationContext";
import type { ChannelPage, Message } from "@/types/api";
import { getLastFakeEventSource } from "../../mocks/EventSource";

type AuthState = ReturnType<typeof useAuthContext>;
type NotificationContextValue = ReturnType<typeof useNotification>;

const MockAuthContext = createContext<Pick<AuthState, "mercureToken" | "refreshMercureToken">>({
  mercureToken: "token-abc",
  refreshMercureToken: vi.fn(),
});

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => useContext(MockAuthContext),
}));

const MockNotificationContext = createContext<NotificationContextValue>({
  notify: vi.fn(),
});

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => useContext(MockNotificationContext),
}));

vi.mock("@/api/serverInfo", () => ({
  getServerInfo: () => ({ mercureUrl: "https://mercure.example.com/.well-known/mercure" }),
}));

const COMMUNITY_ID = "c1";
const CHANNEL_ID = "general";
const TOPIC = `/api/communities/${COMMUNITY_ID}/channels/${CHANNEL_ID}`;

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MockAuthContext.Provider value={{ mercureToken: "token-abc", refreshMercureToken: vi.fn() }}>
        <MockNotificationContext.Provider value={{ notify: vi.fn() }}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </MockNotificationContext.Provider>
      </MockAuthContext.Provider>
    );
  };
}

function seedCache(queryClient: QueryClient, pageNumber: number) {
  queryClient.setQueryData(queryKeys.channelPages(COMMUNITY_ID, CHANNEL_ID), {
    pages: [
      {
        "@id": `/api/channel-pages/${pageNumber}`,
        "@type": "ChannelPage",
        id: pageNumber,
        pageNumber,
        messageCount: 0,
        prevPageId: null,
        nextPageId: null,
        messages: [],
      },
    ],
    pageParams: [pageNumber],
  });
}

function makeMessageEvent(message: Partial<Message>): MessageEvent {
  return new MessageEvent("message", { data: JSON.stringify(message) });
}

function makeMessage(id: string, pageNumber: number): Partial<Message> {
  return {
    "@id": id,
    "@type": "Message",
    id: id.replace("/api/messages/", ""),
    text: "hi",
    isDeleted: false,
    edited: false,
    createdAt: new Date().toISOString(),
    reactions: null,
    pageNumber,
  };
}

describe("useChannelMercure historical-mode handling", () => {
  it("inserts the message into the cache when isLatestLoaded() is true", () => {
    const queryClient = new QueryClient();
    seedCache(queryClient, 5);
    const onNewMessageWhileHistorical = vi.fn();

    renderHook(
      () =>
        useChannelMercure(TOPIC, COMMUNITY_ID, CHANNEL_ID, {
          isLatestLoaded: () => true,
          onNewMessageWhileHistorical,
        }),
      { wrapper: makeWrapper(queryClient) },
    );

    const es = getLastFakeEventSource()!;
    act(() => es.onmessage?.(makeMessageEvent(makeMessage("/api/messages/m1", 5))));

    const cache = queryClient.getQueryData<{ pages: ChannelPage[] }>(
      queryKeys.channelPages(COMMUNITY_ID, CHANNEL_ID),
    );
    expect(cache?.pages[0]!.messages).toHaveLength(1);
    expect(cache?.pages[0]!.messages![0]!["@id"]).toBe("/api/messages/m1");
    expect(onNewMessageWhileHistorical).not.toHaveBeenCalled();
  });

  it("does NOT mutate the cache when isLatestLoaded() is false; bumps the counter callback instead", () => {
    const queryClient = new QueryClient();
    seedCache(queryClient, 5);
    const onNewMessageWhileHistorical = vi.fn();

    renderHook(
      () =>
        useChannelMercure(TOPIC, COMMUNITY_ID, CHANNEL_ID, {
          isLatestLoaded: () => false,
          onNewMessageWhileHistorical,
        }),
      { wrapper: makeWrapper(queryClient) },
    );

    const es = getLastFakeEventSource()!;
    act(() => es.onmessage?.(makeMessageEvent(makeMessage("/api/messages/m1", 10))));

    const cache = queryClient.getQueryData<{ pages: ChannelPage[] }>(
      queryKeys.channelPages(COMMUNITY_ID, CHANNEL_ID),
    );
    // Cache unchanged: still one page, still no messages.
    expect(cache?.pages).toHaveLength(1);
    expect(cache?.pages[0]!.messages).toHaveLength(0);
    expect(onNewMessageWhileHistorical).toHaveBeenCalledOnce();
  });

  it("always applies message.update events regardless of historical mode (edits/reactions must patch cached messages)", () => {
    const queryClient = new QueryClient();
    // Seed with a message that will receive an update event.
    queryClient.setQueryData(queryKeys.channelPages(COMMUNITY_ID, CHANNEL_ID), {
      pages: [
        {
          "@id": "/api/channel-pages/5",
          "@type": "ChannelPage",
          id: 5,
          pageNumber: 5,
          messageCount: 1,
          prevPageId: null,
          nextPageId: null,
          messages: [
            {
              "@id": "/api/messages/m1",
              "@type": "Message",
              id: "m1",
              text: "old",
              isDeleted: false,
              edited: false,
              createdAt: new Date().toISOString(),
              reactions: null,
              pageNumber: 5,
            },
          ],
        },
      ],
      pageParams: [5],
    });
    const onNewMessageWhileHistorical = vi.fn();

    renderHook(
      () =>
        useChannelMercure(TOPIC, COMMUNITY_ID, CHANNEL_ID, {
          isLatestLoaded: () => false,
          onNewMessageWhileHistorical,
        }),
      { wrapper: makeWrapper(queryClient) },
    );

    const es = getLastFakeEventSource()!;
    const update = {
      type: "message.update" as const,
      "@id": "/api/messages/m1",
      text: "edited",
      edited: true,
    };
    act(() => es.onmessage?.(new MessageEvent("message", { data: JSON.stringify(update) })));

    const cache = queryClient.getQueryData<{ pages: ChannelPage[] }>(
      queryKeys.channelPages(COMMUNITY_ID, CHANNEL_ID),
    );
    expect(cache?.pages[0]!.messages![0]!.text).toBe("edited");
    expect(cache?.pages[0]!.messages![0]!.edited).toBe(true);
    expect(onNewMessageWhileHistorical).not.toHaveBeenCalled();
  });

  it("applies new messages normally when no isLatestLoaded callback is provided (default behavior)", () => {
    const queryClient = new QueryClient();
    seedCache(queryClient, 5);

    renderHook(() => useChannelMercure(TOPIC, COMMUNITY_ID, CHANNEL_ID), {
      wrapper: makeWrapper(queryClient),
    });

    const es = getLastFakeEventSource()!;
    act(() => es.onmessage?.(makeMessageEvent(makeMessage("/api/messages/m1", 5))));

    const cache = queryClient.getQueryData<{ pages: ChannelPage[] }>(
      queryKeys.channelPages(COMMUNITY_ID, CHANNEL_ID),
    );
    expect(cache?.pages[0]!.messages).toHaveLength(1);
  });
});
