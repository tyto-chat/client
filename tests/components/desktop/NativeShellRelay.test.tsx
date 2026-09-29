import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { NativeShellRelay } from "@/desktop/NativeShellRelay";
import {
  isNotificationSnoozed,
  resetNativeShellForTests,
  showNativeNotification,
} from "@/desktop/nativeShell";
import {
  ConnectionsContext,
  type ConnectionsContextValue,
} from "@/desktop/connections/ConnectionsContext";
import type {
  ConnectionRegistry,
  RegistrySnapshot,
} from "@/desktop/connections/ConnectionRegistry";
import type { ConnectionSnapshot } from "@/desktop/connections/IdentityConnection";
import { NotificationProvider } from "@/context/NotificationContext";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import type { BridgeBadgeState, PlatformBridge, TrayCommand } from "@/platform/PlatformBridge";
import i18n from "@/i18n";

const call = {
  activeCall: null as null | { channel: { name: string }; identityKey: string },
  isMuted: false,
  toggleMute: vi.fn(),
  leave: vi.fn(),
};
vi.mock("@/context/AudioCallContext", () => ({ useAudioCall: () => call }));

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

let snapshot: RegistrySnapshot;
let registryListeners: Set<() => void>;
let badges: BridgeBadgeState[];
let deepLink: ((payload: string) => void) | null;
let trayCommand: ((command: TrayCommand) => void) | null;
let unsubscribed: string[];
let switchTo: ReturnType<typeof vi.fn>;
let presenceBodies: unknown[];

function makeBridge(): PlatformBridge {
  return {
    ...createFakePlatformBridge(),
    bridgeVersion: 2,
    notifications: { show: vi.fn() },
    appState: { setBadge: (state) => void badges.push(state) },
    app: {
      getVersion: async () => "1.0.0",
      setAutoLaunch: async () => undefined,
      quit: () => undefined,
      onDeepLink: (handler) => {
        deepLink = handler;
        return () => void unsubscribed.push("deep-link");
      },
      onTrayCommand: (handler) => {
        trayCommand = handler;
        return () => void unsubscribed.push("tray-command");
      },
    },
  };
}

function renderRelay() {
  const registry = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      registryListeners.add(listener);
      return () => registryListeners.delete(listener);
    },
    getConnection: vi.fn(() => undefined),
    addIdentity: vi.fn(),
  } as unknown as ConnectionRegistry;
  const value: ConnectionsContextValue = {
    registry,
    switchTo: switchTo as unknown as ConnectionsContextValue["switchTo"],
  };
  return render(
    <NotificationProvider>
      <ConnectionsContext.Provider value={value}>
        <NativeShellRelay />
      </ConnectionsContext.Provider>
    </NotificationProvider>,
  );
}

function updateSnapshot(next: RegistrySnapshot) {
  snapshot = next;
  act(() => {
    for (const listener of registryListeners) listener();
  });
}

const url = (value: string) => JSON.stringify({ kind: "url", url: value });

beforeEach(() => {
  vi.stubEnv("VITE_APP_MODE", "desktop");
  resetNativeShellForTests();
  snapshot = { activeIdentityId: "ia", connections: [connection({ unreadCounts: { dm: 2 } })] };
  registryListeners = new Set();
  badges = [];
  deepLink = null;
  trayCommand = null;
  unsubscribed = [];
  switchTo = vi.fn().mockResolvedValue(undefined);
  presenceBodies = [];
  call.activeCall = null;
  call.isMuted = false;
  call.toggleMute.mockClear();
  call.leave.mockClear();
  configureApiClient(BASE);
  setAccessToken("test-token");
  setPlatformBridgeForTests(makeBridge());
  server.use(
    http.post(`${BASE}/api/v1/me/presence`, async ({ request }) => {
      presenceBodies.push(await request.json());
      return HttpResponse.json({ state: "away" });
    }),
  );
});

afterEach(async () => {
  vi.unstubAllEnvs();
  setPlatformBridgeForTests(null);
  await i18n.changeLanguage("en");
});

describe("NativeShellRelay", () => {
  it("reports unread and call state to the shell and follows changes", async () => {
    renderRelay();
    await waitFor(() =>
      expect(badges.at(-1)).toEqual({ unreadCount: 2, callState: "none", tooltip: "2 unread" }),
    );

    updateSnapshot({
      activeIdentityId: "ia",
      connections: [connection({ unreadCounts: { dm: 5 } })],
    });
    await waitFor(() =>
      expect(badges.at(-1)).toEqual({ unreadCount: 5, callState: "none", tooltip: "5 unread" }),
    );
  });

  it("does not repeat an unchanged badge state", async () => {
    renderRelay();
    await waitFor(() => expect(badges).toHaveLength(1));

    updateSnapshot({ ...snapshot, connections: [connection({ unreadCounts: { dm: 2 } })] });
    await new Promise((r) => setTimeout(r, 300));

    expect(badges).toHaveLength(1);
  });

  it("includes the call in the badge state", async () => {
    call.activeCall = { channel: { name: "voice" }, identityKey: "ia" };
    call.isMuted = true;
    renderRelay();

    await waitFor(() =>
      expect(badges.at(-1)).toEqual({
        unreadCount: 2,
        callState: "in-call-muted",
        callLabel: "#voice @ Srv",
        tooltip: "In call (muted): #voice @ Srv",
      }),
    );
  });

  it("sends the tooltip again when the language changes", async () => {
    renderRelay();
    await waitFor(() => expect(badges.at(-1)?.tooltip).toBe("2 unread"));

    await act(async () => {
      await i18n.changeLanguage("pl");
    });

    await waitFor(() => expect(badges.at(-1)?.tooltip).toBe("2 nieprzeczytane"));
  });

  it("uses the right plural form for the language", async () => {
    await act(async () => {
      await i18n.changeLanguage("pl");
    });
    snapshot = { activeIdentityId: "ia", connections: [connection({ unreadCounts: { dm: 5 } })] };
    renderRelay();

    await waitFor(() => expect(badges.at(-1)?.tooltip).toBe("5 nieprzeczytanych"));
  });

  it("applies tray commands", async () => {
    renderRelay();
    await waitFor(() => expect(trayCommand).not.toBeNull());

    act(() => trayCommand!({ type: "toggle-mute" }));
    act(() => trayCommand!({ type: "leave-call" }));
    act(() => trayCommand!({ type: "snooze", minutes: 30 }));
    act(() => trayCommand!({ type: "presence", value: "away" }));

    expect(call.toggleMute).toHaveBeenCalledTimes(1);
    expect(call.leave).toHaveBeenCalledTimes(1);
    expect(isNotificationSnoozed(Date.now())).toBe(true);
    await waitFor(() => expect(presenceBodies).toEqual([{ status: "away" }]));
  });

  it("clears a manual presence when the tray asks for online", async () => {
    renderRelay();
    await waitFor(() => expect(trayCommand).not.toBeNull());

    act(() => trayCommand!({ type: "presence", value: "online" }));

    await waitFor(() => expect(presenceBodies).toEqual([{ status: null }]));
  });

  it("ignores a tray command it does not know", async () => {
    renderRelay();
    await waitFor(() => expect(trayCommand).not.toBeNull());

    act(() => trayCommand!({ type: "self-destruct" } as unknown as TrayCommand));
    act(() => trayCommand!(null as unknown as TrayCommand));

    expect(call.leave).not.toHaveBeenCalled();
    expect(presenceBodies).toEqual([]);
  });

  it("switches identity and opens the message for a link to a known server", async () => {
    snapshot = {
      activeIdentityId: "ia",
      connections: [
        connection({ identityId: "ia" }),
        connection({ identityId: "ib", origin: "https://other.example" }),
      ],
    };
    renderRelay();
    await waitFor(() => expect(deepLink).not.toBeNull());

    act(() => deepLink!(url("https://other.example/m/0b1e3c8e-1111-4222-8333-444455556666")));

    expect(switchTo).toHaveBeenCalledWith("ib", {
      to: "/m/$messageId",
      params: { messageId: "0b1e3c8e-1111-4222-8333-444455556666" },
    });
  });

  it("asks before adding a server a link points to, and names the host", async () => {
    renderRelay();
    await waitFor(() => expect(deepLink).not.toBeNull());

    act(() => deepLink!(url("https://new.example/m/0b1e3c8e-1111-4222-8333-444455556666")));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("new.example");
    expect(screen.queryByTestId("wizard-server-input")).not.toBeInTheDocument();
    expect(switchTo).not.toHaveBeenCalled();
  });

  it("opens the wizard prefilled once the user agrees", async () => {
    renderRelay();
    await waitFor(() => expect(deepLink).not.toBeNull());
    act(() => deepLink!(url("https://new.example/")));

    const dialog = await screen.findByRole("dialog");
    await userEvent.setup().click(within(dialog).getByTestId("confirm-dialog-confirm"));

    expect(await screen.findByTestId("wizard-server-input")).toHaveValue("https://new.example");
  });

  it("does nothing when the user declines", async () => {
    renderRelay();
    await waitFor(() => expect(deepLink).not.toBeNull());
    act(() => deepLink!(url("https://new.example/")));

    const dialog = await screen.findByRole("dialog");
    await userEvent.setup().click(within(dialog).getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByTestId("wizard-server-input")).not.toBeInTheDocument();
    expect(switchTo).not.toHaveBeenCalled();
  });

  it("shows an internationalised host in its unambiguous encoded form", async () => {
    renderRelay();
    await waitFor(() => expect(deepLink).not.toBeNull());

    act(() => deepLink!(url("https://tуto.example/")));

    expect(await screen.findByRole("dialog")).toHaveTextContent("xn--");
  });

  it("ignores a second link while one is waiting for an answer", async () => {
    renderRelay();
    await waitFor(() => expect(deepLink).not.toBeNull());

    act(() => deepLink!(url("https://first.example/")));
    await screen.findByRole("dialog");
    act(() => deepLink!(url("https://second.example/")));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toHaveTextContent("first.example");
  });

  it("runs the stored action for a notification click", async () => {
    renderRelay();
    await waitFor(() => expect(deepLink).not.toBeNull());
    const bridge = makeBridge();
    const show = vi.fn();
    bridge.notifications = { show };
    const onClick = vi.fn();
    showNativeNotification(bridge, "tyto", { body: "b", onClick }, { focused: false, now: 0 });

    act(() =>
      deepLink!(JSON.stringify({ kind: "notification", payload: show.mock.calls[0]![0].payload })),
    );

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("ignores a malformed link", async () => {
    renderRelay();
    await waitFor(() => expect(deepLink).not.toBeNull());

    act(() => deepLink!("not json"));
    act(() => deepLink!(url("http://srv.example/")));

    expect(switchTo).not.toHaveBeenCalled();
    expect(screen.queryByTestId("wizard-server-input")).not.toBeInTheDocument();
  });

  it("unsubscribes from the shell when it unmounts", async () => {
    const { unmount } = renderRelay();
    await waitFor(() => expect(deepLink).not.toBeNull());

    unmount();

    expect(unsubscribed.sort()).toEqual(["deep-link", "tray-command"]);
  });

  it("does nothing in web mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "web");
    renderRelay();
    await new Promise((r) => setTimeout(r, 300));

    expect(badges).toEqual([]);
    expect(deepLink).toBeNull();
    expect(trayCommand).toBeNull();
  });

  it("does nothing when the shell offers no native features", async () => {
    setPlatformBridgeForTests(createFakePlatformBridge());
    renderRelay();
    await new Promise((r) => setTimeout(r, 300));

    expect(badges).toEqual([]);
    expect(deepLink).toBeNull();
  });
});

describe("NativeShellRelay outside the desktop shell", () => {
  it("does not load the desktop translations in web mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "web");
    const i18n = (await import("@/i18n")).default;
    const loadNamespaces = vi.spyOn(i18n, "loadNamespaces");

    renderRelay();
    await new Promise((r) => setTimeout(r, 100));

    expect(loadNamespaces.mock.calls.flat(2)).not.toContain("desktop");
    loadNamespaces.mockRestore();
  });
});
