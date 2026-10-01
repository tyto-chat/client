import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetNativeShellForTests, setNotificationSnooze } from "@/desktop/nativeShell";
import { resetSoundAmbientForTests, setSoundAmbient } from "@/sounds/soundAmbient";
import { setSoundPlayerForTests, type PlayOptions } from "@/sounds/soundPlayer";
import type { SoundName } from "@/sounds/soundSet";
import { resetSoundSettingsForTests, updateSoundSettings } from "@/sounds/soundSettings";
import {
  playCallSound,
  playNotificationSound,
  playRandomSound,
  playTestSound,
  resetSoundsForTests,
} from "@/sounds/sounds";
import { setPreferredDevice } from "@/utils/deviceSettings";

const LAST_NOTIFICATION_KEY = "tyto.sounds.lastNotificationAt";

let played: Array<[SoundName, PlayOptions]>;
let outputDevices: string[];
let hasFocus: ReturnType<typeof vi.spyOn>;

describe("sounds", () => {
  beforeEach(() => {
    played = [];
    outputDevices = [];
    setSoundPlayerForTests({
      play: (name, options) => played.push([name, options]),
      setOutputDevice: (id) => outputDevices.push(id),
    });
    resetSoundSettingsForTests();
    resetSoundAmbientForTests();
    resetSoundsForTests();
    resetNativeShellForTests();
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));
    hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setSoundPlayerForTests(null);
  });

  it("plays the user's own join at the chosen volume", () => {
    updateSoundSettings({ volume: 40 });
    playCallSound("self-join");
    expect(played).toEqual([["join", { volume: 0.4, scale: 1, pitch: 0, stretch: 1 }]]);
  });

  it("plays someone else's join quieter", () => {
    playCallSound("peer-join");
    expect(played).toEqual([["join", { volume: 0.6, scale: 0.45, pitch: 0, stretch: 1 }]]);
  });

  it("plays no call sound when they are switched off", () => {
    updateSoundSettings({ callSounds: false });
    playCallSound("self-join");
    expect(played).toEqual([]);
  });

  it("plays no mute sound in push-to-talk", () => {
    setSoundAmbient({ voiceMode: "ptt" });
    playCallSound("mute");
    expect(played).toEqual([]);
  });

  it("plays the notification sound", () => {
    playNotificationSound({
      notificationType: "dm_message",
      sameServer: true,
      conversationIdentifier: "abc",
    });
    expect(played).toEqual([["notification", { volume: 0.6, scale: 1, pitch: 0, stretch: 1 }]]);
  });

  it("stays silent for a notification that is not about a message", () => {
    playNotificationSound({ notificationType: "report_filed", sameServer: true });
    expect(played).toEqual([]);
  });

  it("does not start the two seconds for a notification that is not about a message", () => {
    playNotificationSound({ notificationType: "report_filed", sameServer: true });
    expect(localStorage.getItem(LAST_NOTIFICATION_KEY)).toBeNull();
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    expect(played).toEqual([["notification", { volume: 0.6, scale: 1, pitch: 0, stretch: 1 }]]);
  });

  it("plays it once for a burst, and again after two seconds", () => {
    const target = {
      notificationType: "dm_message",
      sameServer: true,
      conversationIdentifier: "abc",
    };
    playNotificationSound(target);
    vi.advanceTimersByTime(1999);
    playNotificationSound(target);
    expect(played).toHaveLength(1);
    vi.advanceTimersByTime(1);
    playNotificationSound(target);
    expect(played).toHaveLength(2);
  });

  it("stays silent when another tab chimed half a second ago", () => {
    localStorage.setItem(LAST_NOTIFICATION_KEY, String(Date.now() - 500));
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    expect(played).toEqual([]);
  });

  it("plays when another tab chimed two seconds ago", () => {
    localStorage.setItem(LAST_NOTIFICATION_KEY, String(Date.now() - 2000));
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    expect(played).toHaveLength(1);
  });

  it.each([
    ["an unreadable value", () => "soon"],
    ["a time far in the future", () => String(Date.now() + 2001)],
  ])("ignores %s left by another tab", (_label, stored) => {
    localStorage.setItem(LAST_NOTIFICATION_KEY, stored());
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    expect(played).toHaveLength(1);
  });

  it("tells other tabs when it chimed", () => {
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    expect(localStorage.getItem(LAST_NOTIFICATION_KEY)).toBe(String(Date.now()));
  });

  it("keeps the two seconds when storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    vi.advanceTimersByTime(500);
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    expect(played).toHaveLength(1);
  });

  it("forgets the other tabs' chime when reset", () => {
    localStorage.setItem(LAST_NOTIFICATION_KEY, String(Date.now()));
    resetSoundsForTests();
    expect(localStorage.getItem(LAST_NOTIFICATION_KEY)).toBeNull();
  });

  it("does not let a silenced notification reset the two seconds", () => {
    setSoundAmbient({ presence: "dnd" });
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    setSoundAmbient({ presence: "online" });
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    expect(played).toHaveLength(1);
  });

  it("stays silent for the conversation on screen while the window is focused", () => {
    window.history.pushState({}, "", "/dm/abc");
    hasFocus.mockReturnValue(true);
    playNotificationSound({
      notificationType: "dm_message",
      sameServer: true,
      conversationIdentifier: "abc",
    });
    expect(played).toEqual([]);
  });

  it("plays for the conversation on screen when the window is in the background", () => {
    window.history.pushState({}, "", "/dm/abc");
    hasFocus.mockReturnValue(false);
    playNotificationSound({
      notificationType: "dm_message",
      sameServer: true,
      conversationIdentifier: "abc",
    });
    expect(played).toHaveLength(1);
  });

  it("plays quieter during a call", () => {
    setSoundAmbient({ inCall: true });
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    expect(played).toEqual([["notification", { volume: 0.6, scale: 0.45, pitch: 0, stretch: 1 }]]);
  });

  it("stays silent while the tray snooze is on", () => {
    setNotificationSnooze(30, Date.now());
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    expect(played).toEqual([]);
  });

  it("stays silent when notification sounds are off, and call sounds still play", () => {
    updateSoundSettings({ notificationSounds: false });
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    playCallSound("self-leave");
    expect(played).toEqual([["leave", { volume: 0.6, scale: 1, pitch: 0, stretch: 1 }]]);
  });

  it("plays every sound at the chosen pitch and length", () => {
    updateSoundSettings({ pitch: 5, length: 150 });
    playCallSound("self-join");
    playNotificationSound({ notificationType: "dm_message", sameServer: true });
    playTestSound("mute");
    expect(played.map(([, options]) => [options.pitch, options.stretch])).toEqual([
      [5, 1.5],
      [5, 1.5],
      [5, 1.5],
    ]);
  });

  it("plays a random sound from the five, with the current settings", () => {
    updateSoundSettings({ volume: 30, pitch: -3, length: 80 });
    vi.spyOn(Math, "random").mockReturnValue(0.61);
    const name = playRandomSound();
    expect(name).toBe("unmute");
    expect(played).toEqual([["unmute", { volume: 0.3, scale: 1, pitch: -3, stretch: 0.8 }]]);
  });

  it("reaches the first and the last sound at the ends of the random range", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.999);
    expect([playRandomSound(), playRandomSound()]).toEqual(["join", "notification"]);
  });

  it("plays a test sound even when everything is switched off", () => {
    updateSoundSettings({ callSounds: false, notificationSounds: false });
    setSoundAmbient({ presence: "dnd" });
    playTestSound("notification");
    expect(played).toEqual([["notification", { volume: 0.6, scale: 1, pitch: 0, stretch: 1 }]]);
  });

  it("uses the output device chosen for calls", () => {
    setPreferredDevice("audiooutput", "headset");
    playCallSound("self-join");
    expect(outputDevices.at(-1)).toBe("headset");
  });

  it("returns to the default output when the device is cleared", () => {
    setPreferredDevice("audiooutput", "headset");
    playCallSound("self-join");
    setPreferredDevice("audiooutput", "");
    playCallSound("self-join");
    expect(outputDevices.at(-1)).toBe("");
  });
});
