import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createContext, useContext, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import { patchMessageInPages } from "@/queries/messageQueries";
import { useChannelMercure, useConversationMercure, useThreadMercure } from "@/hooks/useMercure";
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

function newMessage(id: string): Message {
  return {
    "@id": `/api/messages/${id}`,
    "@type": "Message",
    id,
    text: "fresh",
    isDeleted: false,
    edited: false,
    createdAt: new Date().toISOString(),
    reactions: null,
    pageNumber: 1,
  } as Message;
}

function withMessage(base: ChannelPage, message: Message): ChannelPage {
  return { ...base, messages: [...(base.messages ?? []), message], messageCount: 2 };
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

  it("does not replay an older update over a newer edit when the fetch fails", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pending: Array<{ resolve: () => void; reject: () => void }> = [];
    const queryFn = vi.fn(
      () =>
        new Promise<ChannelPage>((resolve, reject) =>
          pending.push({
            resolve: () => resolve(page(null)),
            reject: () => reject(new Error("down")),
          }),
        ),
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

    await act(async () => pending.shift()!.resolve());
    await waitFor(() => expect(result.current.data?.pages[0]!.messages).toHaveLength(1));

    act(() => void queryClient.invalidateQueries({ queryKey: KEY }));
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));

    const es = getLastFakeEventSource()!;
    act(() =>
      es.onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({ type: "message.update", "@id": MESSAGE_IRI, text: "older" }),
        }),
      ),
    );
    act(() =>
      queryClient.setQueryData<InfiniteData<ChannelPage>>(KEY, (old) =>
        patchMessageInPages(old, MESSAGE_IRI, { text: "newer" }),
      ),
    );

    await act(async () => pending.shift()!.reject());
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(result.current.data?.pages[0]!.messages![0]!.text).toBe("newer");
  });

  it("does not replay a new message into a timeline that moved to history", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pending: Array<() => void> = [];
    const queryFn = vi.fn(
      () => new Promise<ChannelPage>((resolve) => pending.push(() => resolve(page(null)))),
    );
    let latestLoaded = true;

    const { result } = renderHook(
      () => {
        useChannelMercure("c/12", "c1", "general", { isLatestLoaded: () => latestLoaded });
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

    act(() => void queryClient.invalidateQueries({ queryKey: KEY }));
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));

    const es = getLastFakeEventSource()!;
    act(() =>
      es.onmessage?.(new MessageEvent("message", { data: JSON.stringify(newMessage("m2")) })),
    );
    latestLoaded = false;

    await act(async () => pending.shift()!());
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    const ids = result.current.data?.pages.flatMap((p) => p.messages!.map((m) => m["@id"]));
    expect(ids).toEqual([MESSAGE_IRI]);
  });
});

describe("replay boundaries", () => {
  function renderChannel(queryFn: () => Promise<ChannelPage>) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(
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
    return { queryClient, ...view };
  }

  function sendUpdate(patch: Record<string, unknown>) {
    const es = getLastFakeEventSource()!;
    act(() =>
      es.onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({ type: "message.update", "@id": MESSAGE_IRI, ...patch }),
        }),
      ),
    );
  }

  it("does not overwrite a newer single-message cache when replaying", async () => {
    const pending: Array<() => void> = [];
    const queryFn = vi.fn(
      () => new Promise<ChannelPage>((resolve) => pending.push(() => resolve(page(null)))),
    );
    const { queryClient, result } = renderChannel(queryFn);
    await act(async () => pending.shift()!());
    await waitFor(() => expect(result.current.data?.pages[0]!.messages).toHaveLength(1));
    queryClient.setQueryData(queryKeys.message("m1"), page(null).messages![0]);

    act(() => void queryClient.invalidateQueries({ queryKey: KEY }));
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    sendUpdate({ text: "older" });
    queryClient.setQueryData<Message>(queryKeys.message("m1"), (old) =>
      old ? { ...old, text: "newer" } : old,
    );

    await act(async () => pending.shift()!());
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(queryClient.getQueryData<Message>(queryKeys.message("m1"))?.text).toBe("newer");
  });

  it("keeps an update when the single-message cache is reloading too", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pagePending: Array<() => void> = [];
    const detailPending: Array<() => void> = [];
    const pageFn = vi.fn(
      () => new Promise<ChannelPage>((resolve) => pagePending.push(() => resolve(page(null)))),
    );
    const detailFn = vi.fn(
      () =>
        new Promise<Message>((resolve) =>
          detailPending.push(() => resolve(page(null).messages![0]!)),
        ),
    );
    const { result } = renderHook(
      () => {
        useChannelMercure("c/12", "c1", "general");
        const pages = useInfiniteQuery({
          queryKey: KEY,
          queryFn: pageFn,
          initialPageParam: 1,
          getNextPageParam: () => undefined,
        });
        const detail = useQuery({ queryKey: queryKeys.message("m1"), queryFn: detailFn });
        return { pages, detail };
      },
      { wrapper: wrapper(queryClient) },
    );
    await act(async () => {
      pagePending.shift()!();
      detailPending.shift()!();
    });
    await waitFor(() => expect(result.current.detail.data?.reactions).toBeNull());

    act(() => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: queryKeys.message("m1") });
    });
    await waitFor(() => expect(detailFn).toHaveBeenCalledTimes(2));
    sendUpdate({ reactions: REACTIONS });

    await act(async () => detailPending.shift()!());
    await act(async () => pagePending.shift()!());
    await waitFor(() => expect(result.current.detail.isFetching).toBe(false));

    await waitFor(() => expect(result.current.detail.data?.reactions).toEqual(REACTIONS));
    expect(
      queryClient.getQueryData<InfiniteData<ChannelPage>>(KEY)?.pages[0]!.messages![0]!.reactions,
    ).toEqual(REACTIONS);
  });

  it("keeps an update when an optimistic mutation cancels the in-flight fetch", async () => {
    const pending: Array<() => void> = [];
    const queryFn = vi.fn(
      () => new Promise<ChannelPage>((resolve) => pending.push(() => resolve(page(null)))),
    );
    const { queryClient, result } = renderChannel(queryFn);
    await act(async () => pending.shift()!());
    await waitFor(() => expect(result.current.data?.pages[0]!.messages).toHaveLength(1));

    act(() => void queryClient.invalidateQueries({ queryKey: KEY }));
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    sendUpdate({ reactions: REACTIONS });

    await act(async () => queryClient.cancelQueries({ queryKey: KEY }));
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(result.current.data?.pages[0]!.messages![0]!.reactions).toEqual(REACTIONS);
  });

  it("keeps a thread reply that arrives while the thread is reloading", async () => {
    const root = MESSAGE_IRI;
    const reply = { ...newMessage("r1"), parent: root } as unknown as Message;
    const pending: Array<() => void> = [];
    const queryFn = vi.fn(
      () => new Promise<Message[]>((resolve) => pending.push(() => resolve([]))),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => {
        useThreadMercure(root, "c/12/t");
        return useQuery({ queryKey: queryKeys.threadReplies(root), queryFn });
      },
      { wrapper: wrapper(queryClient) },
    );
    await act(async () => pending.shift()!());
    await waitFor(() => expect(result.current.data).toEqual([]));

    act(() => void queryClient.invalidateQueries({ queryKey: queryKeys.threadReplies(root) }));
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    const es = getLastFakeEventSource()!;
    act(() => es.onmessage?.(new MessageEvent("message", { data: JSON.stringify(reply) })));

    await act(async () => pending.shift()!());
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    await waitFor(() =>
      expect(result.current.data?.map((m) => m["@id"])).toEqual(["/api/messages/r1"]),
    );
  });
});

describe("DM realtime updates during an in-flight page fetch", () => {
  const DM_KEY = queryKeys.conversationPages("dm1");

  function renderDm(queryFn: () => Promise<ChannelPage>) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(
      () => {
        useConversationMercure("dm1", 7);
        return useInfiniteQuery({
          queryKey: DM_KEY,
          queryFn,
          initialPageParam: 1,
          getNextPageParam: () => undefined,
        });
      },
      { wrapper: wrapper(queryClient) },
    );
    return { queryClient, ...view };
  }

  it.each([
    ["is missing from", () => page(null)],
    ["already includes", () => withMessage(page(null), newMessage("m2"))],
  ])(
    "shows a new message exactly once when the fetch result %s it",
    async (_label, settledPage) => {
      const pending: Array<() => void> = [];
      let next = () => page(null);
      const queryFn = vi.fn(
        () => new Promise<ChannelPage>((resolve) => pending.push(() => resolve(next()))),
      );
      const { queryClient, result } = renderDm(queryFn);

      await act(async () => pending.shift()!());
      await waitFor(() => expect(result.current.data?.pages[0]!.messages).toHaveLength(1));

      act(() => void queryClient.invalidateQueries({ queryKey: DM_KEY }));
      await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));

      const es = getLastFakeEventSource()!;
      act(() =>
        es.onmessage?.(new MessageEvent("message", { data: JSON.stringify(newMessage("m2")) })),
      );

      next = settledPage;
      await act(async () => pending.shift()!());
      await waitFor(() => expect(result.current.isFetching).toBe(false));

      const ids = result.current.data?.pages.flatMap((p) => p.messages!.map((m) => m["@id"]));
      expect(ids).toEqual([MESSAGE_IRI, "/api/messages/m2"]);
    },
  );
});
