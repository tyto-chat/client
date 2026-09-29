import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  SOUND_SETTINGS_KEY,
  getSoundSettings,
  updateSoundSettings,
  useSoundSettings,
  resetSoundSettingsForTests,
} from "@/sounds/soundSettings";

describe("soundSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    resetSoundSettingsForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with both groups on at volume 60", () => {
    expect(getSoundSettings()).toEqual({ callSounds: true, notificationSounds: true, volume: 60 });
  });

  it("remembers a change", () => {
    updateSoundSettings({ notificationSounds: false, volume: 35 });
    resetSoundSettingsForTests();
    expect(getSoundSettings()).toEqual({ callSounds: true, notificationSounds: false, volume: 35 });
  });

  it.each([
    [-5, 0],
    [140, 100],
    [42.6, 43],
  ])("keeps volume %s in range as %s", (given, stored) => {
    updateSoundSettings({ volume: given });
    expect(getSoundSettings().volume).toBe(stored);
  });

  it.each([
    ["not json", { callSounds: true, notificationSounds: true, volume: 60 }],
    [
      '{"volume":"loud","callSounds":"yes"}',
      { callSounds: true, notificationSounds: true, volume: 60 },
    ],
    ['{"callSounds":false}', { callSounds: false, notificationSounds: true, volume: 60 }],
    ["[1,2]", { callSounds: true, notificationSounds: true, volume: 60 }],
  ])("reads %s as defaults where it is unusable", (stored, expected) => {
    localStorage.setItem(SOUND_SETTINGS_KEY, stored);
    resetSoundSettingsForTests();
    expect(getSoundSettings()).toEqual(expected);
  });

  it("keeps working when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    updateSoundSettings({ callSounds: false });
    expect(getSoundSettings().callSounds).toBe(false);
  });

  it("sees a change made in another tab", () => {
    const { result } = renderHook(() => useSoundSettings());
    expect(getSoundSettings().volume).toBe(60);
    localStorage.setItem(SOUND_SETTINGS_KEY, '{"volume":25,"callSounds":false}');
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: SOUND_SETTINGS_KEY }));
    });
    expect(getSoundSettings()).toEqual({ callSounds: false, notificationSounds: true, volume: 25 });
    expect(result.current).toEqual({ callSounds: false, notificationSounds: true, volume: 25 });
  });

  it("returns to defaults when another tab clears storage", () => {
    updateSoundSettings({ volume: 30 });
    localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(getSoundSettings().volume).toBe(60);
  });

  it("ignores a change to other stored values", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useSoundSettings();
    });
    const before = getSoundSettings();
    const rendersBefore = renders;
    localStorage.setItem(SOUND_SETTINGS_KEY, '{"volume":25}');
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "tyto.other" }));
    });
    expect(getSoundSettings()).toBe(before);
    expect(renders).toBe(rendersBefore);
  });

  it("keeps a setting another tab changed when this tab changes a different one", () => {
    expect(getSoundSettings().notificationSounds).toBe(true);
    localStorage.setItem(SOUND_SETTINGS_KEY, '{"notificationSounds":false}');
    updateSoundSettings({ volume: 20 });
    expect(getSoundSettings()).toEqual({ callSounds: true, notificationSounds: false, volume: 20 });
  });

  it("keeps every change until reload when storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    updateSoundSettings({ volume: 20 });
    updateSoundSettings({ callSounds: false });
    expect(getSoundSettings()).toEqual({ callSounds: false, notificationSounds: true, volume: 20 });
  });

  it("tells subscribers", () => {
    const { result } = renderHook(() => useSoundSettings());
    act(() => updateSoundSettings({ volume: 10 }));
    expect(result.current.volume).toBe(10);
  });
});
