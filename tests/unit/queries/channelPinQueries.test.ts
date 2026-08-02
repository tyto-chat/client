import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { useSetChannelPinState } from "@/queries/notificationPreferenceQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { NotificationPreferencesSnapshot } from "@/types/api";

const COMMUNITY = "comm-1";
const CHANNEL = "general";
const CHANNEL_ID = 10;

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

beforeEach(() => {
  configureApiClient(BASE);
});

describe("useSetChannelPinState", () => {
  it("adds a favorite row to the snapshot cache on success", async () => {
    server.use(
      http.put(`${BASE}/api/v1/communities/${COMMUNITY}/channels/${CHANNEL}/pin-state`, () =>
        HttpResponse.json({ pinState: "favorite" }),
      ),
    );

    const queryClient = makeQueryClient();
    queryClient.setQueryData<NotificationPreferencesSnapshot>(queryKeys.notificationPreferences(), {
      channels: [],
      mutedCommunityIds: [],
    });

    const { result } = renderHook(() => useSetChannelPinState(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(() =>
      result.current.mutateAsync({
        communityIdentifier: COMMUNITY,
        channelIdentifier: CHANNEL,
        channelId: CHANNEL_ID,
        pinState: "favorite",
      }),
    );

    const snapshot = queryClient.getQueryData<NotificationPreferencesSnapshot>(
      queryKeys.notificationPreferences(),
    );
    expect(snapshot?.channels).toEqual([
      { channelId: CHANNEL_ID, level: "mentions", pinState: "favorite" },
    ]);
  });

  it("drops the row when clearing pin on an otherwise-default channel", async () => {
    server.use(
      http.put(`${BASE}/api/v1/communities/${COMMUNITY}/channels/${CHANNEL}/pin-state`, () =>
        HttpResponse.json({ pinState: null }),
      ),
    );

    const queryClient = makeQueryClient();
    queryClient.setQueryData<NotificationPreferencesSnapshot>(queryKeys.notificationPreferences(), {
      channels: [{ channelId: CHANNEL_ID, level: "mentions", pinState: "favorite" }],
      mutedCommunityIds: [],
    });

    const { result } = renderHook(() => useSetChannelPinState(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(() =>
      result.current.mutateAsync({
        communityIdentifier: COMMUNITY,
        channelIdentifier: CHANNEL,
        channelId: CHANNEL_ID,
        pinState: null,
      }),
    );

    const snapshot = queryClient.getQueryData<NotificationPreferencesSnapshot>(
      queryKeys.notificationPreferences(),
    );
    expect(snapshot?.channels).toEqual([]);
  });
});
