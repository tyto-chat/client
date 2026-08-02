import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { useLeaveChannel, useRemoveChannelMember } from "@/queries/channelQueries";
import { queryKeys } from "@/queries/queryKeys";

const COMMUNITY = "comm-1";
const CHANNEL = "chan-1";
const USER_ID = 42;

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
  server.use(
    http.delete(
      `${BASE}/api/v1/communities/${COMMUNITY}/channels/${CHANNEL}/members/${USER_ID}`,
      () => new HttpResponse(null, { status: 204 }),
    ),
  );
});

describe("useLeaveChannel", () => {
  it("calls DELETE /communities/:community/channels/:channel/members/:userId", async () => {
    let capturedUrl: string | undefined;

    server.use(
      http.delete(
        `${BASE}/api/v1/communities/${COMMUNITY}/channels/${CHANNEL}/members/${USER_ID}`,
        ({ request }) => {
          capturedUrl = request.url;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useLeaveChannel(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    await act(() => result.current.mutateAsync(USER_ID));

    expect(capturedUrl).toContain(
      `/communities/${COMMUNITY}/channels/${CHANNEL}/members/${USER_ID}`,
    );
  });

  it("invalidates the community query on success", async () => {
    const queryClient = makeQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useLeaveChannel(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    await act(() => result.current.mutateAsync(USER_ID));

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.community(COMMUNITY) }),
    );
  });

  it("does NOT invalidate the channelMembers query (that is useRemoveChannelMember's job)", async () => {
    const queryClient = makeQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useLeaveChannel(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    await act(() => result.current.mutateAsync(USER_ID));

    expect(spy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.channelMembers(COMMUNITY, CHANNEL) }),
    );
  });
});

describe("useRemoveChannelMember (contrast: invalidation scope)", () => {
  it("invalidates channel members query (not the community) on success", async () => {
    const queryClient = makeQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveChannelMember(COMMUNITY, CHANNEL), {
      wrapper: makeWrapper(queryClient),
    });

    await act(() => result.current.mutateAsync(USER_ID));

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.channelMembers(COMMUNITY, CHANNEL) }),
    );
    expect(spy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.community(COMMUNITY) }),
    );
  });
});
