import { describe, it, expect, afterEach, vi } from "vitest";
import type { UserPreferencesPatch } from "@/api/userPreferences";
import { DEVICE_SCOPED_PREF_KEYS, isDeviceScopedPref } from "@/platform/deviceScopedPreferences";

const ACCOUNT_KEYS: (keyof UserPreferencesPatch)[] = [
  "sendTypingIndicator",
  "convertEmoticons",
  "resumeLastLocation",
  "sectionCollapse",
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isDeviceScopedPref", () => {
  it("is false for every key in web mode", () => {
    vi.stubEnv("VITE_APP_MODE", "web");
    for (const key of [...DEVICE_SCOPED_PREF_KEYS, ...ACCOUNT_KEYS]) {
      expect(isDeviceScopedPref(key)).toBe(false);
    }
  });

  it.each(["desktop", "mobile"])("is true only for the device keys in %s mode", (mode) => {
    vi.stubEnv("VITE_APP_MODE", mode);
    for (const key of DEVICE_SCOPED_PREF_KEYS) {
      expect(isDeviceScopedPref(key)).toBe(true);
    }
    for (const key of ACCOUNT_KEYS) {
      expect(isDeviceScopedPref(key)).toBe(false);
    }
  });

  it("lists exactly the five device-describing server keys", () => {
    expect([...DEVICE_SCOPED_PREF_KEYS].sort()).toEqual(
      ["desktopNotifications", "locale", "submitKey", "theme", "timezone"].sort(),
    );
  });
});
