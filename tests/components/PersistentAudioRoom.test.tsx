import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { queryKeys } from "@/queries/queryKeys";

vi.mock("@tanstack/react-router", () => ({ Outlet: () => null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1 } }) }));

const leaveChannel = vi.fn().mockResolvedValue(undefined);
const sendLeaveChannelBeacon = vi.fn();
vi.mock("@/api/livekit", () => ({
  leaveChannel: (...args: unknown[]) => leaveChannel(...args),
  sendLeaveChannelBeacon: (...args: unknown[]) => sendLeaveChannelBeacon(...args),
}));

const executeIdentityRequest = vi.fn().mockResolvedValue(true);
const getActiveIdentityKey = vi.fn().mockReturnValue(null);
vi.mock("@/platform/activeIdentity", () => ({
  executeIdentityRequest: (...args: unknown[]) => executeIdentityRequest(...args),
  getActiveIdentityKey: () => getActiveIdentityKey(),
}));

let mockActiveCall: {
  communityId: string;
  channel: { identifier: string };
  identityKey?: string | null;
} | null = null;
vi.mock("@/context/AudioCallContext", () => ({
  useAudioCall: () => ({ activeCall: mockActiveCall, leave: vi.fn() }),
}));

import { PersistentAudioRoom } from "@/components/PersistentAudioRoom";

function renderRoom(qc: QueryClient = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, ...render(createElement(PersistentAudioRoom), { wrapper }) };
}

describe("PersistentAudioRoom", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    leaveChannel.mockClear();
    sendLeaveChannelBeacon.mockClear();
    executeIdentityRequest.mockClear().mockResolvedValue(true);
    getActiveIdentityKey.mockReset().mockReturnValue(null);
    mockActiveCall = null;
  });

  it("does not fetch on beforeunload", () => {
    renderRoom();
    window.dispatchEvent(new Event("beforeunload"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves via the global leaveChannel path when identityKey is null (web mode)", () => {
    mockActiveCall = {
      communityId: "alpha",
      channel: { identifier: "general" },
      identityKey: null,
    };
    const { rerender } = renderRoom();
    mockActiveCall = null;
    rerender(createElement(PersistentAudioRoom));

    expect(leaveChannel).toHaveBeenCalledWith("alpha", "general");
    expect(executeIdentityRequest).not.toHaveBeenCalled();
  });

  it("leaves via the global path when the owning identity is still active", () => {
    getActiveIdentityKey.mockReturnValue("ia");
    mockActiveCall = {
      communityId: "alpha",
      channel: { identifier: "general" },
      identityKey: "ia",
    };
    const { rerender } = renderRoom();
    mockActiveCall = null;
    rerender(createElement(PersistentAudioRoom));

    expect(leaveChannel).toHaveBeenCalledWith("alpha", "general");
    expect(executeIdentityRequest).not.toHaveBeenCalled();
  });

  it("routes leave through the identity request executor for a cross-identity call", () => {
    getActiveIdentityKey.mockReturnValue("ib");
    mockActiveCall = {
      communityId: "alpha",
      channel: { identifier: "general" },
      identityKey: "ia",
    };
    const { rerender } = renderRoom();
    mockActiveCall = null;
    rerender(createElement(PersistentAudioRoom));

    expect(executeIdentityRequest).toHaveBeenCalledWith(
      "ia",
      "/communities/alpha/channels/general/call",
      { method: "DELETE", keepalive: true },
    );
    expect(leaveChannel).not.toHaveBeenCalled();
  });

  it("falls back to the global leaveChannel path when the executor is not registered (returns false)", async () => {
    executeIdentityRequest.mockResolvedValue(false);
    getActiveIdentityKey.mockReturnValue("ib");
    mockActiveCall = {
      communityId: "alpha",
      channel: { identifier: "general" },
      identityKey: "ia",
    };
    const { rerender } = renderRoom();
    mockActiveCall = null;
    rerender(createElement(PersistentAudioRoom));

    await vi.waitFor(() => expect(leaveChannel).toHaveBeenCalledWith("alpha", "general"));
  });

  it("clears the participant cache when the owning identity is active", () => {
    getActiveIdentityKey.mockReturnValue("ia");
    mockActiveCall = {
      communityId: "alpha",
      channel: { identifier: "general" },
      identityKey: "ia",
    };
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.channelParticipants("alpha", "general"), [
      { userId: 1 },
      { userId: 2 },
    ]);
    const { rerender } = renderRoom(qc);
    mockActiveCall = null;
    rerender(createElement(PersistentAudioRoom));

    expect(qc.getQueryData(queryKeys.channelParticipants("alpha", "general"))).toEqual([
      { userId: 2 },
    ]);
  });

  it("leaves the participant cache untouched when the owning identity is not active", () => {
    getActiveIdentityKey.mockReturnValue("ib");
    mockActiveCall = {
      communityId: "alpha",
      channel: { identifier: "general" },
      identityKey: "ia",
    };
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.channelParticipants("alpha", "general"), [
      { userId: 1 },
      { userId: 2 },
    ]);
    const { rerender } = renderRoom(qc);
    mockActiveCall = null;
    rerender(createElement(PersistentAudioRoom));

    expect(qc.getQueryData(queryKeys.channelParticipants("alpha", "general"))).toEqual([
      { userId: 1 },
      { userId: 2 },
    ]);
  });

  it("pagehide sends the global beacon when identityKey is null (web mode)", () => {
    mockActiveCall = {
      communityId: "alpha",
      channel: { identifier: "general" },
      identityKey: null,
    };
    renderRoom();
    window.dispatchEvent(new Event("pagehide"));

    expect(sendLeaveChannelBeacon).toHaveBeenCalledWith("alpha", "general");
    expect(executeIdentityRequest).not.toHaveBeenCalled();
  });

  it("pagehide sends the global beacon when the owning identity is still active", () => {
    getActiveIdentityKey.mockReturnValue("ia");
    mockActiveCall = {
      communityId: "alpha",
      channel: { identifier: "general" },
      identityKey: "ia",
    };
    renderRoom();
    window.dispatchEvent(new Event("pagehide"));

    expect(sendLeaveChannelBeacon).toHaveBeenCalledWith("alpha", "general");
    expect(executeIdentityRequest).not.toHaveBeenCalled();
  });

  it("pagehide routes the leave through the identity request executor for a cross-identity call", () => {
    getActiveIdentityKey.mockReturnValue("ib");
    mockActiveCall = {
      communityId: "alpha",
      channel: { identifier: "general" },
      identityKey: "ia",
    };
    renderRoom();
    window.dispatchEvent(new Event("pagehide"));

    expect(executeIdentityRequest).toHaveBeenCalledWith(
      "ia",
      "/communities/alpha/channels/general/call",
      { method: "DELETE", keepalive: true },
    );
    expect(sendLeaveChannelBeacon).not.toHaveBeenCalled();
  });
});
