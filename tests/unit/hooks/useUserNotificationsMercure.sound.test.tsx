import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { resetSoundAmbientForTests } from "@/sounds/soundAmbient";
import { setSoundPlayerForTests } from "@/sounds/soundPlayer";
import type { SoundName } from "@/sounds/soundSet";
import { resetSoundSettingsForTests } from "@/sounds/soundSettings";
import { resetSoundsForTests } from "@/sounds/sounds";
import type { NotificationMercureEvent } from "@/types/api";

let captured: ((e: MessageEvent) => void) | null = null;
const navigate = vi.fn();
const notify = vi.fn();

vi.mock("@/hooks/useMercureSubscription", () => ({
  useMercureSubscription: (_t: string | null, onMessage: (e: MessageEvent) => void) => {
    captured = onMessage;
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/context/AuthContext", () => ({ useAuthContext: () => ({ user: { id: 7 } }) }));
vi.mock("@/context/NotificationContext", () => ({ useNotification: () => ({ notify }) }));
vi.mock("@/utils/desktopNotifications", () => ({ showDesktopNotification: vi.fn() }));

import { useUserNotificationsMercure } from "@/hooks/useUserNotificationsMercure";

function makeRaw(overrides: Partial<NotificationMercureEvent> = {}): NotificationMercureEvent {
  return {
    type: "notification",
    id: 42,
    notificationType: "mention",
    isRead: false,
    communityId: 5,
    communityIdentifier: "owls",
    channelIdentifier: "general",
    conversationIdentifier: null,
    messageIri: "/api/messages/abc",
    authorName: "Alice",
    groupName: null,
    groupIdentifier: null,
    actorIds: null,
    messageCount: 1,
    createdAt: "2026-08-14T00:00:00Z",
    ...overrides,
  };
}

function fire(payload: unknown) {
  captured?.({ data: JSON.stringify(payload) } as MessageEvent);
}

let played: SoundName[];

describe("useUserNotificationsMercure sounds", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    captured = null;
    navigate.mockClear();
    notify.mockClear();
    played = [];
    setSoundPlayerForTests({
      play: (name) => played.push(name),
      setOutputDevice: () => undefined,
    });
    resetSoundsForTests();
    resetSoundSettingsForTests();
    resetSoundAmbientForTests();
    localStorage.clear();
    window.history.pushState({}, "", "/");
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    queryClient = new QueryClient();
    renderHook(() => useUserNotificationsMercure(), { wrapper });
  });

  afterEach(() => {
    setSoundPlayerForTests(null);
    vi.restoreAllMocks();
  });

  it("plays once for a direct message", () => {
    fire(
      makeRaw({
        notificationType: "dm_message",
        communityId: null,
        communityIdentifier: "",
        channelIdentifier: "",
        conversationIdentifier: "conv-1",
      }),
    );

    expect(played).toEqual(["notification"]);
  });

  it("plays once for a mention in a channel", () => {
    fire(makeRaw({ notificationType: "mention" }));

    expect(played).toEqual(["notification"]);
  });

  it("is silent for a notification that is not about a message", () => {
    fire(
      makeRaw({
        notificationType: "group_added",
        communityIdentifier: "owls",
        channelIdentifier: "",
        groupName: "Owls",
        groupIdentifier: "owls-group",
      }),
    );

    expect(notify).toHaveBeenCalled();
    expect(played).toEqual([]);
  });

  it("is silent for a coalesced update", () => {
    fire(makeRaw({ type: "notification.update", notificationType: "channel_activity" }));

    expect(played).toEqual([]);
  });

  it("is silent for the conversation on screen in a focused window", () => {
    window.history.pushState({}, "", "/dm/abc");

    fire(
      makeRaw({
        notificationType: "dm_message",
        communityId: null,
        communityIdentifier: "",
        channelIdentifier: "",
        conversationIdentifier: "abc",
      }),
    );

    expect(played).toEqual([]);
  });

  it("plays for a channel other than the one on screen", () => {
    window.history.pushState({}, "", "/owls/general");

    fire(
      makeRaw({
        notificationType: "mention",
        communityIdentifier: "owls",
        channelIdentifier: "random",
      }),
    );

    expect(played).toEqual(["notification"]);
  });
});
