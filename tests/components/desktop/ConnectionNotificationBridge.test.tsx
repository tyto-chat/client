import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ConnectionNotificationBridge } from "@/desktop/ConnectionNotificationBridge";
import {
  ConnectionsContext,
  type ConnectionsContextValue,
} from "@/desktop/connections/ConnectionsContext";
import type { ConnectionRegistry } from "@/desktop/connections/ConnectionRegistry";
import type { ConnectionNotificationEvent } from "@/desktop/connections/IdentityConnection";
import type { NotificationMercureEvent } from "@/types/api";
import * as desktopNotifications from "@/utils/desktopNotifications";

const notifyMock = vi.fn();
vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: notifyMock }),
}));

function makeRaw(overrides: Partial<NotificationMercureEvent> = {}): NotificationMercureEvent {
  return {
    type: "notification",
    id: 42,
    notificationType: "mention",
    isRead: false,
    communityId: 5,
    communityIdentifier: "acme",
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

function makeRegistryStub(activeIdentityId: string | null): {
  registry: ConnectionRegistry;
  emit: (event: ConnectionNotificationEvent) => void;
} {
  let listener: ((event: ConnectionNotificationEvent) => void) | null = null;
  const registry = {
    getSnapshot: () => ({ connections: [], activeIdentityId }),
    subscribe: () => () => undefined,
    onNotification: (l: (event: ConnectionNotificationEvent) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
  } as unknown as ConnectionRegistry;
  return {
    registry,
    emit: (event) => listener?.(event),
  };
}

function renderWithContext(
  registry: ConnectionRegistry,
  switchTo: ConnectionsContextValue["switchTo"],
) {
  return render(
    <ConnectionsContext.Provider value={{ registry, switchTo }}>
      <ConnectionNotificationBridge />
    </ConnectionsContext.Provider>,
  );
}

describe("ConnectionNotificationBridge", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    notifyMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("toasts + native-notifies for a background identity's event, and wires the click to switchTo with a deep link", () => {
    const switchTo = vi.fn().mockResolvedValue(undefined);
    const { registry, emit } = makeRegistryStub("active-id");
    const showSpy = vi
      .spyOn(desktopNotifications, "showDesktopNotification")
      .mockImplementation(() => undefined);

    renderWithContext(registry, switchTo);

    emit({
      identityId: "bg-id",
      origin: "https://bg.example",
      serverName: "Beta",
      raw: makeRaw(),
    });

    expect(notifyMock).toHaveBeenCalledTimes(1);
    const [message, variant] = notifyMock.mock.calls[0]!;
    expect(message).toContain("Beta");
    expect(message).toContain("@Alice mentioned you in #general");
    expect(variant).toBe("info");

    expect(showSpy).toHaveBeenCalledTimes(1);
    const [title, opts] = showSpy.mock.calls[0]!;
    expect(title).toBe("tyto.chat");
    expect(opts.body).toContain("@Alice mentioned you in #general");
    expect(opts.tag).toBe("https://bg.example:acme:general");

    opts.onClick?.();
    expect(switchTo).toHaveBeenCalledWith(
      "bg-id",
      expect.objectContaining({
        to: "/$communityId/$channelId",
        params: { communityId: "acme", channelId: "general" },
      }),
    );
  });

  it("builds a DM deep link and tag for a background identity's dm_message event", () => {
    const switchTo = vi.fn().mockResolvedValue(undefined);
    const { registry, emit } = makeRegistryStub("active-id");
    const showSpy = vi
      .spyOn(desktopNotifications, "showDesktopNotification")
      .mockImplementation(() => undefined);

    renderWithContext(registry, switchTo);

    emit({
      identityId: "bg-id",
      origin: "https://bg.example",
      serverName: "Beta",
      raw: makeRaw({
        notificationType: "dm_message",
        communityId: null,
        communityIdentifier: "",
        channelIdentifier: "",
        conversationIdentifier: "conv-1",
      }),
    });

    const [, opts] = showSpy.mock.calls[0]!;
    expect(opts.tag).toBe("https://bg.example:dm:conv-1");

    opts.onClick?.();
    expect(switchTo).toHaveBeenCalledWith("bg-id", {
      to: "/dm/$conversationId",
      params: { conversationId: "conv-1" },
    });
  });

  it("ignores events belonging to the active identity", () => {
    const switchTo = vi.fn();
    const { registry, emit } = makeRegistryStub("active-id");
    const showSpy = vi
      .spyOn(desktopNotifications, "showDesktopNotification")
      .mockImplementation(() => undefined);

    renderWithContext(registry, switchTo);

    emit({
      identityId: "active-id",
      origin: "https://active.example",
      serverName: "Alpha",
      raw: makeRaw(),
    });

    expect(notifyMock).not.toHaveBeenCalled();
    expect(showSpy).not.toHaveBeenCalled();
  });

  it("is a no-op outside ConnectionsContext", () => {
    const { container } = render(<ConnectionNotificationBridge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does nothing when not in managed identity mode, even inside ConnectionsContext", () => {
    vi.stubEnv("VITE_APP_MODE", "");
    const switchTo = vi.fn();
    const { registry, emit } = makeRegistryStub("active-id");
    const showSpy = vi
      .spyOn(desktopNotifications, "showDesktopNotification")
      .mockImplementation(() => undefined);

    renderWithContext(registry, switchTo);

    emit({
      identityId: "bg-id",
      origin: "https://bg.example",
      serverName: "Beta",
      raw: makeRaw(),
    });

    expect(notifyMock).not.toHaveBeenCalled();
    expect(showSpy).not.toHaveBeenCalled();
  });
});
