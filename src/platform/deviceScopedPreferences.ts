import type { UserPreferencesPatch } from "@/api/userPreferences";
import { isManagedIdentityMode } from "./appMode";

export const DEVICE_SCOPED_PREF_KEYS = [
  "theme",
  "submitKey",
  "locale",
  "timezone",
  "desktopNotifications",
] as const;

export type DeviceScopedPrefKey = (typeof DEVICE_SCOPED_PREF_KEYS)[number];

export function isDeviceScopedPref(key: keyof UserPreferencesPatch): boolean {
  return isManagedIdentityMode() && (DEVICE_SCOPED_PREF_KEYS as readonly string[]).includes(key);
}
