import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sub = vi.hoisted(() => ({
  topics: undefined as string | string[] | null | undefined,
  onMessage: null as ((e: MessageEvent) => void) | null,
  onReconnect: undefined as (() => void) | undefined,
}));
vi.mock("@/hooks/useMercureSubscription", () => ({
  useMercureSubscription: (
    topics: string | string[] | null,
    onMessage: (e: MessageEvent) => void,
    _errorMessage: string,
    onReconnect?: () => void,
  ) => {
    sub.topics = topics;
    sub.onMessage = onMessage;
    sub.onReconnect = onReconnect;
  },
}));
const fetchPresence = vi.hoisted(() => vi.fn());
vi.mock("@/api/presence", async (orig) => ({
  ...(await orig<typeof import("@/api/presence")>()),
  fetchPresence,
}));
vi.mock("@/api/tokenStore", async (orig) => ({
  ...(await orig<typeof import("@/api/tokenStore")>()),
  getAccessToken: () => "access",
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { usePresenceSubscription } from "@/queries/presenceQueries";
import { queryKeys } from "@/queries/queryKeys";

describe("usePresenceSubscription", () => {
  let qc: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);

  beforeEach(() => {
    qc = new QueryClient();
    sub.topics = undefined;
    fetchPresence.mockReset().mockResolvedValue({ presences: [{ userId: 3, state: "online" }] });
  });

  it("subscribes to one presence topic per unique valid user id, sorted", () => {
    renderHook(() => usePresenceSubscription([8, 3, 3, 0, -1, 1.5]), { wrapper });
    expect(sub.topics).toEqual(["u/3/p", "u/8/p"]);
  });

  it("does not subscribe without users", () => {
    renderHook(() => usePresenceSubscription([]), { wrapper });
    expect(sub.topics).toBeNull();
  });

  it("applies presence events and ignores other payloads", () => {
    renderHook(() => usePresenceSubscription([3]), { wrapper });
    sub.onMessage?.({
      data: JSON.stringify({ type: "presence", userId: 3, state: "away" }),
    } as MessageEvent);
    sub.onMessage?.({
      data: JSON.stringify({ type: "other", userId: 3, state: "dnd" }),
    } as MessageEvent);
    expect(qc.getQueryData(queryKeys.userPresence(3))).toBe("away");
  });

  it("refetches the snapshot after a reconnect and marks missing users offline", async () => {
    renderHook(() => usePresenceSubscription([3, 8]), { wrapper });
    await waitFor(() => expect(fetchPresence).toHaveBeenCalledTimes(1));

    sub.onReconnect?.();

    await waitFor(() => expect(fetchPresence).toHaveBeenCalledTimes(2));
    expect(qc.getQueryData(queryKeys.userPresence(3))).toBe("online");
    expect(qc.getQueryData(queryKeys.userPresence(8))).toBe("offline");
  });
});
