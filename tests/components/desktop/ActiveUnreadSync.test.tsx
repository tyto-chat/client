import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActiveUnreadSync } from "@/desktop/ActiveUnreadSync";
import {
  ConnectionsContext,
  type ConnectionsContextValue,
} from "@/desktop/connections/ConnectionsContext";
import { queryKeys } from "@/queries/queryKeys";

function renderSync(activeIdentityId: string | null, applyUnreadCounts = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const listeners = new Set<() => void>();
  let snapshot = {
    connections: [{ identityId: "active", unreadCounts: {} as Record<string, number> }],
    activeIdentityId,
  };
  const registry = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getConnection: (id: string) => (id === "active" ? { applyUnreadCounts } : undefined),
  };
  const connectionCounted = (unreadCounts: Record<string, number>) => {
    snapshot = { ...snapshot, connections: [{ identityId: "active", unreadCounts }] };
    for (const listener of listeners) listener();
  };
  const value = { registry } as unknown as ConnectionsContextValue;

  render(
    <ConnectionsContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>
        <ActiveUnreadSync />
      </QueryClientProvider>
    </ConnectionsContext.Provider>,
  );
  return { queryClient, applyUnreadCounts, connectionCounted };
}

beforeEach(() => {
  vi.stubEnv("VITE_APP_MODE", "desktop");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ActiveUnreadSync", () => {
  it("hands the active connection the counts the app shows", async () => {
    const { queryClient, applyUnreadCounts } = renderSync("active");

    queryClient.setQueryData(queryKeys.notificationUnreadCounts(), { counts: { dm: 1 } });
    await waitFor(() => expect(applyUnreadCounts).toHaveBeenLastCalledWith({ dm: 1 }));

    queryClient.setQueryData(queryKeys.notificationUnreadCounts(), { counts: { dm: 0 } });
    await waitFor(() => expect(applyUnreadCounts).toHaveBeenLastCalledWith({ dm: 0 }));
  });

  it("corrects the connection when it counts a message the app already shows as read", async () => {
    const { queryClient, applyUnreadCounts, connectionCounted } = renderSync("active");
    queryClient.setQueryData(queryKeys.notificationUnreadCounts(), { counts: { dm: 0 } });
    await waitFor(() => expect(applyUnreadCounts).toHaveBeenCalledTimes(1));

    act(() => connectionCounted({ dm: 1 }));

    await waitFor(() => expect(applyUnreadCounts).toHaveBeenCalledTimes(2));
    expect(applyUnreadCounts).toHaveBeenLastCalledWith({ dm: 0 });
  });

  it("does nothing while no identity is active", async () => {
    const { queryClient, applyUnreadCounts } = renderSync(null);

    queryClient.setQueryData(queryKeys.notificationUnreadCounts(), { counts: { dm: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(applyUnreadCounts).not.toHaveBeenCalled();
  });
});
