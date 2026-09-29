import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showDesktopNotification } from "@/utils/desktopNotifications";
import { resetNativeShellForTests, setNotificationSnooze } from "@/desktop/nativeShell";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { STORAGE_KEYS } from "@/utils/storageKeys";

const show = vi.fn();
const browserNotification = vi.fn();

beforeEach(() => {
  show.mockClear();
  browserNotification.mockClear();
  resetNativeShellForTests();
  localStorage.setItem(STORAGE_KEYS.DESKTOP_NOTIFICATIONS, "true");
  vi.stubGlobal(
    "Notification",
    Object.assign(
      function Notification(this: unknown, ...args: unknown[]) {
        browserNotification(...args);
      },
      { permission: "granted" },
    ),
  );
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  vi.spyOn(document, "hasFocus").mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setPlatformBridgeForTests(null);
  localStorage.clear();
});

function useNativeBridge() {
  setPlatformBridgeForTests({ ...createFakePlatformBridge(), notifications: { show } });
}

describe("showDesktopNotification", () => {
  it("uses the browser notification in web mode even if a bridge offers native ones", () => {
    vi.stubEnv("VITE_APP_MODE", "web");
    useNativeBridge();

    showDesktopNotification("tyto", { body: "hello", tag: "t" });

    expect(browserNotification).toHaveBeenCalledTimes(1);
    expect(show).not.toHaveBeenCalled();
  });

  it("uses the shell's native notification in managed mode", () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    useNativeBridge();

    showDesktopNotification("tyto", { body: "hello", tag: "t" });

    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({ title: "tyto", body: "hello", tag: "t" }),
    );
    expect(browserNotification).not.toHaveBeenCalled();
  });

  it("falls back to the browser notification when the shell has none", () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    setPlatformBridgeForTests(createFakePlatformBridge());

    showDesktopNotification("tyto", { body: "hello" });

    expect(browserNotification).toHaveBeenCalledTimes(1);
  });

  it("respects the notifications preference in managed mode", () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    useNativeBridge();
    localStorage.setItem(STORAGE_KEYS.DESKTOP_NOTIFICATIONS, "false");

    showDesktopNotification("tyto", { body: "hello" });

    expect(show).not.toHaveBeenCalled();
    expect(browserNotification).not.toHaveBeenCalled();
  });

  it("stays silent while the window has focus or notifications are snoozed", () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    useNativeBridge();

    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    showDesktopNotification("tyto", { body: "focused" });

    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    setNotificationSnooze(30, Date.now());
    showDesktopNotification("tyto", { body: "snoozed" });

    expect(show).not.toHaveBeenCalled();
    expect(browserNotification).not.toHaveBeenCalled();
  });
});
