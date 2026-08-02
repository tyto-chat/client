import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";

let captured: ((e: MessageEvent) => void) | null = null;
const navigate = vi.fn();
const notify = vi.fn();
let params: Record<string, string | undefined> = {};

vi.mock("@/hooks/useMercureSubscription", () => ({
  useMercureSubscription: (_t: string | null, onMessage: (e: MessageEvent) => void) => {
    captured = onMessage;
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useParams: () => params,
}));
vi.mock("@/context/AuthContext", () => ({ useAuthContext: () => ({ user: { id: 7 } }) }));
vi.mock("@/context/NotificationContext", () => ({ useNotification: () => ({ notify }) }));

import { useUserEventsMercure } from "@/hooks/useUserEventsMercure";
import { queryKeys } from "@/queries/queryKeys";

function fire(payload: unknown) {
  captured?.({ data: JSON.stringify(payload) } as MessageEvent);
}

describe("useUserEventsMercure", () => {
  let qc: QueryClient;
  let inval: ReturnType<typeof vi.spyOn>;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);

  beforeEach(() => {
    captured = null;
    navigate.mockClear();
    notify.mockClear();
    params = {};
    qc = new QueryClient();
    inval = vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    renderHook(() => useUserEventsMercure(), { wrapper });
  });

  it("server.banned dispatches session:expired", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    fire({ type: "user.event", event: "server.banned" });
    expect(dispatch).toHaveBeenCalled();
    expect((dispatch.mock.calls[0]![0] as CustomEvent).type).toBe("session:expired");
  });

  it("community.removed redirects when viewing that community", () => {
    params.communityId = "c1";
    fire({ type: "user.event", event: "community.removed", communityIdentifier: "c1" });
    expect(navigate).toHaveBeenCalledWith({ to: "/" });
    expect(notify).toHaveBeenCalled();
  });

  it("community.removed only invalidates when elsewhere", () => {
    params.communityId = "other";
    fire({ type: "user.event", event: "community.removed", communityIdentifier: "c1" });
    expect(navigate).not.toHaveBeenCalled();
    expect(inval).toHaveBeenCalledWith({ queryKey: queryKeys.community("c1") });
  });

  it("channel.access.revoked evicts when viewing that channel", () => {
    params.communityId = "c1";
    params.channelId = "general";
    fire({
      type: "user.event",
      event: "channel.access.revoked",
      communityIdentifier: "c1",
      channelIdentifier: "general",
    });
    expect(navigate).toHaveBeenCalledWith({
      to: "/$communityId",
      params: { communityId: "c1" },
    });
    expect(notify).toHaveBeenCalled();
    expect(inval).toHaveBeenCalledWith({ queryKey: queryKeys.community("c1") });
  });

  it("channel.access.revoked only invalidates when viewing a different channel", () => {
    params.communityId = "c1";
    params.channelId = "other";
    fire({
      type: "user.event",
      event: "channel.access.revoked",
      communityIdentifier: "c1",
      channelIdentifier: "general",
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(inval).toHaveBeenCalledWith({ queryKey: queryKeys.community("c1") });
  });

  it("role.changed invalidates without navigating", () => {
    fire({ type: "user.event", event: "role.changed", communityIdentifier: "c1" });
    expect(navigate).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(inval).toHaveBeenCalledWith({ queryKey: queryKeys.community("c1") });
  });
});
