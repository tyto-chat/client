import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({ Outlet: () => null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("@/context/AudioCallContext", () => ({
  useAudioCall: () => ({ activeCall: null, leave: vi.fn() }),
}));
vi.mock("@/api/livekit", () => ({ leaveChannel: vi.fn() }));

import { PersistentAudioRoom } from "@/components/PersistentAudioRoom";

describe("PersistentAudioRoom", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not fetch on beforeunload", () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    render(createElement(PersistentAudioRoom), { wrapper });
    window.dispatchEvent(new Event("beforeunload"));
    expect(fetch).not.toHaveBeenCalled();
  });
});
