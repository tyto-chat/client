import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeBadgeState,
  isNotificationSnoozed,
  resetNativeShellForTests,
  resolveDeepLink,
  setNotificationSnooze,
  showNativeNotification,
  takeNotificationClick,
} from "@/desktop/nativeShell";
import type { RegistrySnapshot } from "@/desktop/connections/ConnectionRegistry";
import type { ConnectionSnapshot } from "@/desktop/connections/IdentityConnection";
import type { PlatformBridge } from "@/platform/PlatformBridge";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";

function connection(extra: Partial<ConnectionSnapshot>): ConnectionSnapshot {
  return {
    identityId: "ia",
    kind: "identity",
    status: "healthy",
    serverName: "Srv",
    origin: "https://srv.example",
    email: "a@b.c",
    displayName: null,
    userId: 1,
    communities: [],
    unreadCounts: {},
    conversationActivityAt: null,
    error: null,
    ...extra,
  } as ConnectionSnapshot;
}

const NOW = 1_000_000;

beforeEach(() => resetNativeShellForTests());
afterEach(() => vi.restoreAllMocks());

describe("notification snooze", () => {
  it("is off by default", () => {
    expect(isNotificationSnoozed(NOW)).toBe(false);
  });

  it("lasts for the requested minutes and then ends", () => {
    setNotificationSnooze(30, NOW);
    expect(isNotificationSnoozed(NOW)).toBe(true);
    expect(isNotificationSnoozed(NOW + 30 * 60_000 - 1)).toBe(true);
    expect(isNotificationSnoozed(NOW + 30 * 60_000)).toBe(false);
  });

  it("lasts until turned back on when no length is given", () => {
    setNotificationSnooze(null, NOW);
    expect(isNotificationSnoozed(NOW + 365 * 24 * 60 * 60_000)).toBe(true);
  });

  it("ends when set to zero minutes", () => {
    setNotificationSnooze(null, NOW);
    setNotificationSnooze(0, NOW);
    expect(isNotificationSnoozed(NOW)).toBe(false);
  });
});

describe("showNativeNotification", () => {
  function bridgeWithSpy() {
    const show = vi.fn();
    const bridge: PlatformBridge = { ...createFakePlatformBridge(), notifications: { show } };
    return { bridge, show };
  }

  const context = { focused: false, now: NOW };

  it("sends title, body and tag and keeps the click for later", () => {
    const { bridge, show } = bridgeWithSpy();
    const onClick = vi.fn();

    expect(
      showNativeNotification(bridge, "tyto", { body: "hello", tag: "srv:dm:1", onClick }, context),
    ).toBe(true);

    expect(show).toHaveBeenCalledTimes(1);
    const sent = show.mock.calls[0]![0];
    expect(sent).toMatchObject({ title: "tyto", body: "hello", tag: "srv:dm:1" });

    takeNotificationClick(sent.payload)?.();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("runs a click only once", () => {
    const { bridge, show } = bridgeWithSpy();
    showNativeNotification(bridge, "tyto", { body: "b", onClick: vi.fn() }, context);

    const { payload } = show.mock.calls[0]![0];
    expect(takeNotificationClick(payload)).toBeTypeOf("function");
    expect(takeNotificationClick(payload)).toBeNull();
  });

  it("does not confuse a click from before a reload with one issued after it", () => {
    const { bridge, show } = bridgeWithSpy();
    const before = vi.fn();
    showNativeNotification(bridge, "tyto", { body: "old", onClick: before }, context);
    const stalePayload = show.mock.calls[0]![0].payload;

    resetNativeShellForTests();
    const after = vi.fn();
    showNativeNotification(bridge, "tyto", { body: "new", onClick: after }, context);

    expect(show.mock.calls[1]![0].payload).not.toBe(stalePayload);
    expect(takeNotificationClick(stalePayload)).toBeNull();
    expect(after).not.toHaveBeenCalled();
  });

  it("ignores a click it never issued", () => {
    expect(takeNotificationClick("nope")).toBeNull();
    expect(takeNotificationClick("__proto__")).toBeNull();
  });

  it("stays silent while the window has focus", () => {
    const { bridge, show } = bridgeWithSpy();
    expect(showNativeNotification(bridge, "tyto", { body: "b" }, { focused: true, now: NOW })).toBe(
      true,
    );
    expect(show).not.toHaveBeenCalled();
  });

  it("stays silent while snoozed", () => {
    const { bridge, show } = bridgeWithSpy();
    setNotificationSnooze(30, NOW);
    expect(showNativeNotification(bridge, "tyto", { body: "b" }, context)).toBe(true);
    expect(show).not.toHaveBeenCalled();
  });

  it("declines when the shell has no native notifications", () => {
    expect(showNativeNotification(createFakePlatformBridge(), "tyto", { body: "b" }, context)).toBe(
      false,
    );
  });

  it("does not grow without bound when clicks never come", () => {
    const { bridge, show } = bridgeWithSpy();
    for (let i = 0; i < 300; i += 1) {
      showNativeNotification(bridge, "tyto", { body: String(i), onClick: vi.fn() }, context);
    }
    expect(takeNotificationClick(show.mock.calls[0]![0].payload)).toBeNull();
    expect(takeNotificationClick(show.mock.calls[299]![0].payload)).toBeTypeOf("function");
  });
});

describe("computeBadgeState", () => {
  it("adds up unread counts across every connection", () => {
    const snapshot: RegistrySnapshot = {
      activeIdentityId: "ia",
      connections: [
        connection({ identityId: "ia", unreadCounts: { dm: 2, "1": 3 } }),
        connection({ identityId: "ib", unreadCounts: { dm: 1 } }),
        connection({ identityId: "ig", kind: "guest", unreadCounts: {} }),
      ],
    };
    expect(computeBadgeState(snapshot, null)).toEqual({ unreadCount: 6, callState: "none" });
  });

  it("copes with no connections", () => {
    expect(computeBadgeState(null, null)).toEqual({ unreadCount: 0, callState: "none" });
  });

  it("ignores counts that are not whole positive numbers", () => {
    const snapshot: RegistrySnapshot = {
      activeIdentityId: "ia",
      connections: [
        connection({
          unreadCounts: { a: -2, b: 1.5, c: Number.NaN, d: 4 } as Record<string, number>,
        }),
      ],
    };
    expect(computeBadgeState(snapshot, null).unreadCount).toBe(4);
  });

  it("describes the call and where it is", () => {
    const snapshot: RegistrySnapshot = {
      activeIdentityId: "ia",
      connections: [connection({ identityId: "ia", serverName: "Srv" })],
    };
    expect(
      computeBadgeState(snapshot, { channelName: "voice", identityKey: "ia", muted: false }),
    ).toEqual({ unreadCount: 0, callState: "in-call", callLabel: "#voice @ Srv" });
    expect(
      computeBadgeState(snapshot, { channelName: "voice", identityKey: "ia", muted: true }),
    ).toMatchObject({ callState: "in-call-muted" });
  });

  it("falls back to the host, then to the channel alone", () => {
    const snapshot: RegistrySnapshot = {
      activeIdentityId: "ia",
      connections: [connection({ identityId: "ia", serverName: null })],
    };
    expect(
      computeBadgeState(snapshot, { channelName: "voice", identityKey: "ia", muted: false })
        .callLabel,
    ).toBe("#voice @ srv.example");
    expect(
      computeBadgeState(snapshot, { channelName: "voice", identityKey: "gone", muted: false })
        .callLabel,
    ).toBe("#voice");
  });
});

describe("resolveDeepLink", () => {
  const snapshot: RegistrySnapshot = {
    activeIdentityId: "ia",
    connections: [
      connection({ identityId: "ia", origin: "https://srv.example" }),
      connection({ identityId: "ib", origin: "https://other.example" }),
      connection({ identityId: "ig", origin: "https://guest.example", kind: "guest" }),
    ],
  };
  const url = (value: string) => JSON.stringify({ kind: "url", url: value });
  const UUID = "0b1e3c8e-1111-4222-8333-444455556666";

  it("switches to the identity on that server and opens the message", () => {
    expect(resolveDeepLink(url(`https://other.example/m/${UUID}`), snapshot)).toEqual({
      kind: "switch",
      identityId: "ib",
      navigateTo: { to: "/m/$messageId", params: { messageId: UUID } },
    });
  });

  it("switches without navigating for a bare server link", () => {
    expect(resolveDeepLink(url("https://other.example/"), snapshot)).toEqual({
      kind: "switch",
      identityId: "ib",
    });
  });

  it("ignores paths it does not understand", () => {
    expect(resolveDeepLink(url("https://other.example/admin/users"), snapshot)).toEqual({
      kind: "switch",
      identityId: "ib",
    });
    expect(resolveDeepLink(url("https://other.example/m/not-a-uuid"), snapshot)).toEqual({
      kind: "switch",
      identityId: "ib",
    });
  });

  it("prefers the active identity, then a signed-in one over a guest", () => {
    const crowded: RegistrySnapshot = {
      activeIdentityId: "i2",
      connections: [
        connection({ identityId: "ig", origin: "https://srv.example", kind: "guest" }),
        connection({ identityId: "i1", origin: "https://srv.example" }),
        connection({ identityId: "i2", origin: "https://srv.example" }),
      ],
    };
    expect(resolveDeepLink(url("https://srv.example/"), crowded)).toMatchObject({
      identityId: "i2",
    });
    expect(
      resolveDeepLink(url("https://srv.example/"), { ...crowded, activeIdentityId: null }),
    ).toMatchObject({ identityId: "i1" });
  });

  it("offers to add a server it does not know", () => {
    expect(resolveDeepLink(url(`https://new.example/m/${UUID}`), snapshot)).toEqual({
      kind: "add-server",
      serverUrl: "https://new.example",
    });
  });

  it("hands a notification click back by its payload", () => {
    expect(
      resolveDeepLink(JSON.stringify({ kind: "notification", payload: "n-1" }), snapshot),
    ).toEqual({ kind: "notification", payload: "n-1" });
  });

  it.each([
    "",
    "not json",
    "null",
    "[]",
    JSON.stringify({ kind: "url" }),
    JSON.stringify({ kind: "url", url: 5 }),
    JSON.stringify({ kind: "url", url: "http://srv.example/" }),
    JSON.stringify({ kind: "url", url: "javascript:alert(1)" }),
    JSON.stringify({ kind: "url", url: "https://user:pw@srv.example/" }),
    JSON.stringify({ kind: "notification" }),
    JSON.stringify({ kind: "other", url: "https://srv.example/" }),
  ])("ignores the malformed envelope %j", (envelope) => {
    expect(resolveDeepLink(envelope, snapshot)).toBeNull();
  });
});
