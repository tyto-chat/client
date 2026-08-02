import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createContext, useContext, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import {
  useChannelParticipants,
  useChannelParticipantsQuery,
} from "@/hooks/useChannelParticipants";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { queryKeys } from "@/queries/queryKeys";
import type { useAuthContext } from "@/context/AuthContext";
import type { useNotification } from "@/context/NotificationContext";
import { getLastFakeEventSource } from "../../mocks/EventSource";
import { TEST_BASE_URL as BASE } from "../../fixtures";

// Context stubs (mirrors useMercureSubscription.test.tsx)

type AuthState = ReturnType<typeof useAuthContext>;
type NotificationContextValue = ReturnType<typeof useNotification>;

const MockAuthContext = createContext<Pick<AuthState, "mercureToken" | "refreshMercureToken">>({
  mercureToken: "mock-mercure-token",
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
  getServerInfo: () => ({
    mercureUrl: "https://mercure.example.com/.well-known/mercure",
  }),
}));

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MockAuthContext.Provider
        value={{ mercureToken: "mock-mercure-token", refreshMercureToken: vi.fn() }}
      >
        <MockNotificationContext.Provider value={{ notify: vi.fn() }}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </MockNotificationContext.Provider>
      </MockAuthContext.Provider>
    );
  };
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const COMMUNITY = "my-community";
const CHANNEL = "general";
const PARTICIPANTS_URL = `${BASE}/api/v1/communities/${COMMUNITY}/channels/${CHANNEL}/participants`;

const emptyCollection = { "hydra:member": [], totalItems: 0 };

describe("useChannelParticipants — Mercure avatar mapping", () => {
  beforeEach(() => {
    configureApiClient(BASE);
    setAccessToken("test-token");
    server.use(http.get(PARTICIPANTS_URL, () => HttpResponse.json(emptyCollection)));
  });

  it("maps a string avatarUrl from Mercure to { sm, md, lg } contentUrl", async () => {
    const queryClient = makeQueryClient();

    renderHook(() => useChannelParticipants(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    const es = getLastFakeEventSource()!;
    act(() =>
      es.dispatch(
        JSON.stringify({
          type: "channel.participants",
          channelId: 1,
          participants: [
            {
              userId: 42,
              name: "Alice",
              avatarUrl: "https://example.com/media/alice.jpg",
              joinedAt: "2024-01-01T00:00:00Z",
            },
          ],
        }),
      ),
    );

    const cached = queryClient.getQueryData<unknown[]>(
      queryKeys.channelParticipants(COMMUNITY, CHANNEL),
    );
    expect(cached).toHaveLength(1);

    const participant = cached![0] as {
      profile: { avatar: { contentUrl: { sm: string; md: string; lg: string } } };
    };
    expect(participant.profile.avatar.contentUrl).toEqual({
      sm: "https://example.com/media/alice.jpg",
      md: "https://example.com/media/alice.jpg",
      lg: "https://example.com/media/alice.jpg",
    });
  });

  it("sets avatar to null when Mercure event has avatarUrl: null", async () => {
    const queryClient = makeQueryClient();

    renderHook(() => useChannelParticipants(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    const es = getLastFakeEventSource()!;
    act(() =>
      es.dispatch(
        JSON.stringify({
          type: "channel.participants",
          channelId: 1,
          participants: [
            {
              userId: 7,
              name: "Bob",
              avatarUrl: null,
              joinedAt: "2024-01-01T00:00:00Z",
            },
          ],
        }),
      ),
    );

    const cached = queryClient.getQueryData<unknown[]>(
      queryKeys.channelParticipants(COMMUNITY, CHANNEL),
    );
    expect(cached).toHaveLength(1);

    const participant = cached![0] as { profile: { avatar: unknown } };
    expect(participant.profile.avatar).toBeNull();
  });

  it("preserves userId, name, and joinedAt from Mercure event", async () => {
    const queryClient = makeQueryClient();

    renderHook(() => useChannelParticipants(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    const es = getLastFakeEventSource()!;
    act(() =>
      es.dispatch(
        JSON.stringify({
          type: "channel.participants",
          channelId: 1,
          participants: [
            {
              userId: 99,
              name: "Carol",
              avatarUrl: null,
              joinedAt: "2025-06-15T12:00:00Z",
            },
          ],
        }),
      ),
    );

    const cached = queryClient.getQueryData<unknown[]>(
      queryKeys.channelParticipants(COMMUNITY, CHANNEL),
    );
    const p = cached![0] as { userId: number; profile: { name: string }; joinedAt: string };
    expect(p.userId).toBe(99);
    expect(p.profile.name).toBe("Carol");
    expect(p.joinedAt).toBe("2025-06-15T12:00:00Z");
  });

  it("replaces cache with all participants from the event", async () => {
    const queryClient = makeQueryClient();

    renderHook(() => useChannelParticipants(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    const es = getLastFakeEventSource()!;
    act(() =>
      es.dispatch(
        JSON.stringify({
          type: "channel.participants",
          channelId: 1,
          participants: [
            { userId: 1, name: "A", avatarUrl: null, joinedAt: "2024-01-01T00:00:00Z" },
            {
              userId: 2,
              name: "B",
              avatarUrl: "https://cdn.example.com/b.jpg",
              joinedAt: "2024-01-01T00:00:00Z",
            },
            { userId: 3, name: "C", avatarUrl: null, joinedAt: "2024-01-01T00:00:00Z" },
          ],
        }),
      ),
    );

    const cached = queryClient.getQueryData<unknown[]>(
      queryKeys.channelParticipants(COMMUNITY, CHANNEL),
    );
    expect(cached).toHaveLength(3);
  });

  it("ignores events with a type other than 'channel.participants'", async () => {
    const queryClient = makeQueryClient();

    renderHook(() => useChannelParticipants(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    const es = getLastFakeEventSource()!;
    act(() =>
      es.dispatch(
        JSON.stringify({
          type: "channel.activity",
          channelIdentifier: "general",
          lastMessageAt: "2024-01-01T00:00:00Z",
        }),
      ),
    );

    const cached = queryClient.getQueryData<unknown[]>(
      queryKeys.channelParticipants(COMMUNITY, CHANNEL),
    );
    expect(cached).toBeUndefined();
  });
});

describe("useChannelParticipantsQuery — initial fetch", () => {
  beforeEach(() => {
    configureApiClient(BASE);
    setAccessToken("test-token");
  });

  it("returns participants from the API", async () => {
    server.use(
      http.get(PARTICIPANTS_URL, () =>
        HttpResponse.json({
          "hydra:member": [
            {
              "@id": "/api/channel-participants/1",
              "@type": "ChannelParticipant",
              id: 1,
              userId: 5,
              joinedAt: "2024-01-01T00:00:00Z",
              profile: {
                "@id": "/api/profiles/5",
                "@type": "UserProfile",
                name: "Dave",
                avatar: {
                  "@id": "/api/media-objects/10",
                  "@type": "MediaObject",
                  contentUrl: {
                    sm: "https://example.com/sm/dave.jpg",
                    md: "https://example.com/md/dave.jpg",
                    lg: "https://example.com/lg/dave.jpg",
                  },
                },
              },
            },
          ],
          totalItems: 1,
        }),
      ),
    );

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useChannelParticipantsQuery(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    const participant = result.current.data![0]!;
    expect(participant.profile.name).toBe("Dave");
    expect(participant.profile.avatar?.contentUrl).toEqual({
      sm: "https://example.com/sm/dave.jpg",
      md: "https://example.com/md/dave.jpg",
      lg: "https://example.com/lg/dave.jpg",
    });
  });

  it("returns an empty array when no participants", async () => {
    server.use(http.get(PARTICIPANTS_URL, () => HttpResponse.json(emptyCollection)));

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useChannelParticipantsQuery(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("returns participant with null avatar when API returns avatar: null", async () => {
    server.use(
      http.get(PARTICIPANTS_URL, () =>
        HttpResponse.json({
          "hydra:member": [
            {
              "@id": "/api/channel-participants/2",
              "@type": "ChannelParticipant",
              id: 2,
              userId: 8,
              joinedAt: "2024-01-01T00:00:00Z",
              profile: {
                "@id": "/api/profiles/8",
                "@type": "UserProfile",
                name: "Eve",
                avatar: null,
              },
            },
          ],
          totalItems: 1,
        }),
      ),
    );

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useChannelParticipantsQuery(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0]!.profile.avatar).toBeNull();
  });
});
