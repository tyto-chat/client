import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetNativeShellForTests, setNotificationSnooze } from "@/desktop/nativeShell";
import { resetSoundAmbientForTests, setSoundAmbient } from "@/sounds/soundAmbient";
import { setSoundPlayerForTests, type PlayOptions } from "@/sounds/soundPlayer";
import type { SoundName } from "@/sounds/soundSet";
import { resetSoundSettingsForTests, updateSoundSettings } from "@/sounds/soundSettings";
import {
  playCallSound,
  playNotificationSound,
  playTestSound,
  resetSoundsForTests,
} from "@/sounds/sounds";
import { setPreferredDevice } from "@/utils/deviceSettings";

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
    expect(played).toEqual([["join", { volume: 0.4, scale: 1 }]]);
  });

  it("plays someone else's join quieter", () => {
    playCallSound("peer-join");
    expect(played).toEqual([["join", { volume: 0.6, scale: 0.45 }]]);
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
    playNotificationSound({ sameServer: true, conversationIdentifier: "abc" });
    expect(played).toEqual([["notification", { volume: 0.6, scale: 1 }]]);
  });

  it("plays it once for a burst, and again after two seconds", () => {
    const target = { sameServer: true, conversationIdentifier: "abc" };
    playNotificationSound(target);
    vi.advanceTimersByTime(1999);
    playNotificationSound(target);
    expect(played).toHaveLength(1);
    vi.advanceTimersByTime(1);
    playNotificationSound(target);
    expect(played).toHaveLength(2);
  });

  it("does not let a silenced notification reset the two seconds", () => {
    setSoundAmbient({ presence: "dnd" });
    playNotificationSound({ sameServer: true });
    setSoundAmbient({ presence: "online" });
    playNotificationSound({ sameServer: true });
    expect(played).toHaveLength(1);
  });

  it("stays silent for the conversation on screen while the window is focused", () => {
    window.history.pushState({}, "", "/dm/abc");
    hasFocus.mockReturnValue(true);
    playNotificationSound({ sameServer: true, conversationIdentifier: "abc" });
    expect(played).toEqual([]);
  });

  it("plays for the conversation on screen when the window is in the background", () => {
    window.history.pushState({}, "", "/dm/abc");
    hasFocus.mockReturnValue(false);
    playNotificationSound({ sameServer: true, conversationIdentifier: "abc" });
    expect(played).toHaveLength(1);
  });

  it("plays quieter during a call", () => {
    setSoundAmbient({ inCall: true });
    playNotificationSound({ sameServer: true });
    expect(played).toEqual([["notification", { volume: 0.6, scale: 0.45 }]]);
  });

  it("stays silent while the tray snooze is on", () => {
    setNotificationSnooze(30, Date.now());
    playNotificationSound({ sameServer: true });
    expect(played).toEqual([]);
  });

  it("stays silent when notification sounds are off, and call sounds still play", () => {
    updateSoundSettings({ notificationSounds: false });
    playNotificationSound({ sameServer: true });
    playCallSound("self-leave");
    expect(played).toEqual([["leave", { volume: 0.6, scale: 1 }]]);
  });

  it("plays a test sound even when everything is switched off", () => {
    updateSoundSettings({ callSounds: false, notificationSounds: false });
    setSoundAmbient({ presence: "dnd" });
    playTestSound("notification");
    expect(played).toEqual([["notification", { volume: 0.6, scale: 1 }]]);
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
