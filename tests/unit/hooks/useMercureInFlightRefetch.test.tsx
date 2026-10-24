import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createContext, useContext, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useInfiniteQuery } from "@tanstack/react-query";
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

const MockNotificationContext = createContext<NotificationContextValue>({ notify: vi.fn() });

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => useContext(MockNotificationContext),
}));

vi.mock("@/api/serverInfo", () => ({
  getServerInfo: () => ({ mercureUrl: "https://mercure.example.com/.well-known/mercure" }),
}));

const KEY = queryKeys.channelPages("c1", "general");
const MESSAGE_IRI = "/api/messages/m1";
const REACTIONS = [{ emoji: "🎉", count: 1, userIds: [2] }];

function page(reactions: unknown, pageNumber = 1): ChannelPage {
  if (pageNumber !== 1) {
    return {
      "@id": `/api/channel-pages/${pageNumber}`,
      "@type": "ChannelPage",
      id: pageNumber,
      pageNumber,
      messageCount: 0,
      prevPageId: null,
      nextPageId: null,
      messages: [],
    };
  }
  return {
    "@id": "/api/channel-pages/1",
    "@type": "ChannelPage",
    id: 1,
    pageNumber: 1,
    messageCount: 1,
    prevPageId: null,
    nextPageId: null,
    messages: [
      {
        "@id": MESSAGE_IRI,
        "@type": "Message",
        id: "m1",
        text: "react-target",
        isDeleted: false,
        edited: false,
        createdAt: new Date().toISOString(),
        reactions,
        pageNumber: 1,
      } as Message,
    ],
  };
}

function wrapper(queryClient: QueryClient) {
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

describe("realtime updates during an in-flight page fetch", () => {
  it("keeps a reaction that arrives while a stale page fetch is still loading", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let serverReactions: unknown = null;
    const pending: Array<(value: ChannelPage) => void> = [];
    const queryFn = vi.fn(() => {
      const snapshot = serverReactions;
      return new Promise<ChannelPage>((resolve) => pending.push(() => resolve(page(snapshot))));
    });

    const { result } = renderHook(
      () => {
        useChannelMercure("c/12", "c1", "general");
        return useInfiniteQuery({
          queryKey: KEY,
          queryFn,
          initialPageParam: 1,
          getNextPageParam: () => undefined,
        });
      },
      { wrapper: wrapper(queryClient) },
    );

    await act(async () => pending.shift()!(page(null)));
    await waitFor(() => expect(result.current.data?.pages[0]!.messages).toHaveLength(1));

    act(() => void queryClient.invalidateQueries({ queryKey: KEY }));
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    const staleFetch = pending.shift()!;

    serverReactions = REACTIONS;
    const es = getLastFakeEventSource()!;
    act(() =>
      es.onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "message.update",
            "@id": MESSAGE_IRI,
            reactions: REACTIONS,
          }),
        }),
      ),
    );

    await act(async () => staleFetch(page(null)));
    await act(async () => {
      while (pending.length) pending.shift()!(page(serverReactions));
    });

    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.data?.pages[0]!.messages![0]!.reactions).toEqual(REACTIONS);
  });

  it("keeps a reaction that arrives while an older page is loading, without interrupting the load", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pending: Array<() => void> = [];
    const queryFn = vi.fn(
      ({ pageParam }: { pageParam: number }) =>
        new Promise<ChannelPage>((resolve) => pending.push(() => resolve(page(null, pageParam)))),
    );

    const { result } = renderHook(
      () => {
        useChannelMercure("c/12", "c1", "general");
        return useInfiniteQuery({
          queryKey: KEY,
          queryFn,
          initialPageParam: 1,
          getNextPageParam: () => undefined,
          getPreviousPageParam: (first) => (first.pageNumber === 1 ? 0 : undefined),
        });
      },
      { wrapper: wrapper(queryClient) },
    );

    await act(async () => pending.shift()!());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));

    act(() => void result.current.fetchPreviousPage());
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));

    const es = getLastFakeEventSource()!;
    act(() =>
      es.onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "message.update",
            "@id": MESSAGE_IRI,
            reactions: REACTIONS,
          }),
        }),
      ),
    );

    await act(async () => pending.shift()!());
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(result.current.data?.pages.map((p) => p.pageNumber)).toEqual([0, 1]);
    expect(result.current.data?.pages[1]!.messages![0]!.reactions).toEqual(REACTIONS);
  });

  it("replays several updates in arrival order once the fetch settles", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pending: Array<() => void> = [];
    const queryFn = vi.fn(
      () => new Promise<ChannelPage>((resolve) => pending.push(() => resolve(page(null)))),
    );

    const { result } = renderHook(
      () => {
        useChannelMercure("c/12", "c1", "general");
        return useInfiniteQuery({
          queryKey: KEY,
          queryFn,
          initialPageParam: 1,
          getNextPageParam: () => undefined,
        });
      },
      { wrapper: wrapper(queryClient) },
    );

    await act(async () => pending.shift()!());
    await waitFor(() => expect(result.current.data?.pages[0]!.messages).toHaveLength(1));
    queryClient.setQueryData(queryKeys.message("m1"), page(null).messages![0]);

    act(() => void queryClient.invalidateQueries({ queryKey: KEY }));
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));

    const es = getLastFakeEventSource()!;
    const latest = [{ emoji: "👍", count: 2, userIds: [2, 3] }];
    for (const reactions of [REACTIONS, latest]) {
      act(() =>
        es.onmessage?.(
          new MessageEvent("message", {
            data: JSON.stringify({ type: "message.update", "@id": MESSAGE_IRI, reactions }),
          }),
        ),
      );
    }

    await act(async () => pending.shift()!());
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(result.current.data?.pages[0]!.messages![0]!.reactions).toEqual(latest);
    expect(queryClient.getQueryData<Message>(queryKeys.message("m1"))?.reactions).toEqual(latest);
  });
});
