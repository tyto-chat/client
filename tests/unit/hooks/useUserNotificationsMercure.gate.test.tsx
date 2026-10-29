import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { setActiveSecurity } from "@/e2ee/admission";
import type { LocalSecuritySnapshot } from "@/e2ee/localSecurityState";
import { queryKeys } from "@/queries/queryKeys";
import type { Conversation, NotificationMercureEvent } from "@/types/api";

let captured: ((e: MessageEvent) => void) | null = null;
const notify = vi.fn();
const desktop = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useMercureSubscription", () => ({
  useMercureSubscription: (_t: string | null, onMessage: (e: MessageEvent) => void) => {
    captured = onMessage;
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/context/AuthContext", () => ({ useAuthContext: () => ({ user: { id: 7 } }) }));
vi.mock("@/context/NotificationContext", () => ({ useNotification: () => ({ notify }) }));
vi.mock("@/utils/desktopNotifications", () => ({ showDesktopNotification: desktop }));
vi.mock("@/sounds/sounds", () => ({ playNotificationSound: vi.fn() }));

import { useUserNotificationsMercure } from "@/hooks/useUserNotificationsMercure";

function dm(conversationIdentifier: string): NotificationMercureEvent {
  return {
    type: "notification",
    id: 42,
    notificationType: "dm_message",
    isRead: false,
    communityId: 0,
    communityIdentifier: "",
    channelIdentifier: "",
    conversationIdentifier,
    messageIri: "/api/messages/abc",
    authorName: "Bora",
    groupName: null,
    groupIdentifier: null,
    actorIds: null,
    messageCount: 1,
    createdAt: "2026-10-29T00:00:00Z",
  } as NotificationMercureEvent;
}

const conversation = (identifier: string, encrypted: boolean) =>
  ({
    id: identifier.length,
    identifier,
    encrypted,
    members: [{ userId: 7 }, { userId: 8 }],
  }) as unknown as Conversation;

describe("notification gate in the notification stream", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);

  beforeEach(() => {
    configureApiClient(BASE);
    setAccessToken("jwt");
    notify.mockClear();
    desktop.mockClear();
    client = new QueryClient();
    client.setQueryData(queryKeys.conversations(), [
      conversation("plain", false),
      conversation("secret", true),
    ]);
    client.setQueryData(queryKeys.dmNotifications(), []);
    const snapshot: LocalSecuritySnapshot = {
      scope: { serverOrigin: "https://chat.example.org", serverUserId: 7, profileId: "p" },
      refusal: { on: true, since: 1 },
      knownBeforeRefusal: new Map(),
      acceptedPlainConversations: new Set(),
      pinnedUserIds: new Set(),
    };
    setActiveSecurity(snapshot);
    renderHook(() => useUserNotificationsMercure(), { wrapper });
  });

  afterEach(() => setActiveSecurity(null));

  it("drops a refused plain DM before toasting, notifying, caching or counting it", () => {
    captured?.({ data: JSON.stringify(dm("plain")) } as MessageEvent);

    expect(notify).not.toHaveBeenCalled();
    expect(desktop).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.dmNotifications())).toEqual([]);
    expect(client.getQueryData(queryKeys.notificationUnreadCounts())).toBeUndefined();
  });

  it("still shows an encrypted DM", () => {
    captured?.({ data: JSON.stringify(dm("secret")) } as MessageEvent);

    expect(notify).toHaveBeenCalled();
    expect(client.getQueryData<unknown[]>(queryKeys.dmNotifications())).toHaveLength(1);
  });

  it("looks up a conversation it does not know before deciding", async () => {
    server.use(
      http.get(`${BASE}/api/v1/conversations/fresh`, () =>
        HttpResponse.json(conversation("fresh", true)),
      ),
      http.get(`${BASE}/api/v1/conversations/stale`, () =>
        HttpResponse.json(conversation("stale", false)),
      ),
    );

    captured?.({ data: JSON.stringify(dm("fresh")) } as MessageEvent);
    captured?.({ data: JSON.stringify({ ...dm("stale"), id: 43 }) } as MessageEvent);

    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<unknown[]>(queryKeys.dmNotifications())).toHaveLength(1);
  });
});
