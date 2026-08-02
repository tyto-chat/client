import { describe, it, expect } from "vitest";
import { navigationFromNotification } from "@/utils/notificationLink";
import type { AppNotification } from "@/types/api";

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    "@id": "/api/notifications/1",
    "@type": "Notification",
    id: 1,
    type: "mention",
    isRead: false,
    createdAt: "2026-05-18T10:00:00Z",
    authorName: "Alice",
    channelIdentifier: "general",
    communityIdentifier: "tyto",
    ...overrides,
  };
}

function assertChannelNav(nav: ReturnType<typeof navigationFromNotification>) {
  if (nav.to !== "/$communityId/$channelId") {
    throw new Error(`expected channel navigation, got ${nav.to}`);
  }
  return nav;
}

describe("navigationFromNotification", () => {
  it("strips the UUID from messageIri and passes it as the `m` search param", () => {
    const nav = assertChannelNav(
      navigationFromNotification(makeNotification({ messageIri: "/api/messages/abc-uuid-123" })),
    );
    expect(nav.to).toBe("/$communityId/$channelId");
    expect(nav.params).toEqual({ communityId: "tyto", channelId: "general" });
    expect(nav.search).toEqual({ m: "abc-uuid-123" });
  });

  it("omits the `m` param when the notification has no messageIri", () => {
    const nav = assertChannelNav(
      navigationFromNotification(makeNotification({ type: "channel_access", messageIri: null })),
    );
    expect(nav.search).toEqual({});
  });

  it("omits the `m` param when messageIri is undefined", () => {
    const nav = assertChannelNav(navigationFromNotification(makeNotification()));
    expect(nav.search).toEqual({});
  });

  it("handles a trailing slash on the messageIri without producing an empty `m`", () => {
    const nav = assertChannelNav(
      navigationFromNotification(makeNotification({ messageIri: "/api/messages/abc-uuid-123/" })),
    );
    expect(nav.search).toEqual({ m: "abc-uuid-123" });
  });

  it("tolerates a versioned /api/v1/... messageIri (uuidFromIri keeps the last path segment)", () => {
    const nav = assertChannelNav(
      navigationFromNotification(makeNotification({ messageIri: "/api/v1/messages/abc-uuid-123" })),
    );
    expect(nav.search).toEqual({ m: "abc-uuid-123" });
  });

  it("does not focus on dm_message notifications either — they still pass through, channel route ignores `m` if it doesn't resolve", () => {
    // (Best-effort: DM permalinks are out of scope; the function itself
    // doesn't care which notification type it sees, it just looks at
    // messageIri. This documents the current contract.)
    const nav = assertChannelNav(
      navigationFromNotification(
        makeNotification({ type: "dm_message", messageIri: "/api/messages/dm-uuid" }),
      ),
    );
    expect(nav.search).toEqual({ m: "dm-uuid" });
  });

  it("routes disk_pressure_purge notifications to /admin (no community/channel to target)", () => {
    const nav = navigationFromNotification(
      makeNotification({
        type: "disk_pressure_purge",
        communityIdentifier: "",
        channelIdentifier: "",
      }),
    );
    expect(nav).toEqual({ to: "/admin" });
  });
});
