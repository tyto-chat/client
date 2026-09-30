import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { SoundName } from "@/sounds/soundSet";
import { setSoundPlayerForTests } from "@/sounds/soundPlayer";
import { resetSoundSettingsForTests } from "@/sounds/soundSettings";
import { resetSoundAmbientForTests } from "@/sounds/soundAmbient";
import { resetSoundsForTests } from "@/sounds/sounds";
import { setDesktopNotificationsEnabled } from "@/utils/desktopNotifications";
import { TestNotificationRow } from "@/components/preferences/TestNotificationRow";

const notify = vi.fn();
const showDesktopNotification = vi.fn();

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify }),
}));

vi.mock("@/utils/desktopNotifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/desktopNotifications")>();
  return {
    ...actual,
    showDesktopNotification: (...args: unknown[]) => showDesktopNotification(...args),
  };
});

let played: SoundName[];
let hasFocus: ReturnType<typeof vi.spyOn>;
let visibility: DocumentVisibilityState;

function send() {
  fireEvent.click(screen.getByTestId("test-notification-send"));
}

function elapse(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  played = [];
  notify.mockReset();
  showDesktopNotification.mockReset();
  setSoundPlayerForTests({
    play: (name) => void played.push(name),
    setOutputDevice: () => undefined,
  });
  localStorage.clear();
  resetSoundSettingsForTests();
  resetSoundAmbientForTests();
  resetSoundsForTests();
  setDesktopNotificationsEnabled(true);
  hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
  visibility = "hidden";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  Reflect.deleteProperty(document, "visibilityState");
  vi.useRealTimers();
  vi.restoreAllMocks();
  setSoundPlayerForTests(null);
});

describe("TestNotificationRow", () => {
  it("counts down for three seconds before sending", () => {
    render(<TestNotificationRow />);
    send();
    expect(screen.getByTestId("test-notification-status").textContent).toBe("Sending in 3…");
    elapse(1000);
    expect(screen.getByTestId("test-notification-status").textContent).toBe("Sending in 2…");
    elapse(1000);
    expect(screen.getByTestId("test-notification-status").textContent).toBe("Sending in 1…");
    expect(notify).not.toHaveBeenCalled();
    expect(played).toEqual([]);
  });

  it("sends the toast, the system popup and the sound together when time is up", () => {
    render(<TestNotificationRow />);
    send();
    elapse(3000);
    expect(notify).toHaveBeenCalledWith("This is a test notification from Tyto.", "info");
    expect(showDesktopNotification).toHaveBeenCalledWith(
      "Tyto",
      expect.objectContaining({ body: "This is a test notification from Tyto." }),
    );
    expect(played).toEqual(["notification"]);
    expect(screen.getByTestId("test-notification-status").textContent).toBe("Sent.");
  });

  it("says why there was no popup when the window is focused", () => {
    hasFocus.mockReturnValue(true);
    visibility = "visible";
    render(<TestNotificationRow />);
    send();
    elapse(3000);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(played).toEqual(["notification"]);
    expect(screen.getByTestId("test-notification-status").textContent).toBe(
      "Sent. No popup: the window was focused.",
    );
  });

  it("says why there was no popup when desktop notifications are off", () => {
    setDesktopNotificationsEnabled(false);
    render(<TestNotificationRow />);
    send();
    elapse(3000);
    expect(showDesktopNotification).not.toHaveBeenCalled();
    expect(screen.getByTestId("test-notification-status").textContent).toBe(
      "Sent. No popup: desktop notifications are off.",
    );
  });

  it("ignores a second click while counting down", () => {
    render(<TestNotificationRow />);
    send();
    elapse(1000);
    send();
    elapse(2000);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("test-notification-send")).toBeEnabled();
  });

  it("clears the status after a while and cancels on unmount", () => {
    const { unmount } = render(<TestNotificationRow />);
    send();
    elapse(3000);
    elapse(6000);
    expect(screen.getByTestId("test-notification-status").textContent).toBe("");
    send();
    unmount();
    elapse(5000);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("labels the button for screen readers", () => {
    render(<TestNotificationRow />);
    expect(screen.getByLabelText("Send a test notification")).toBe(
      screen.getByTestId("test-notification-send"),
    );
  });
});
