import i18n from "@/i18n";
import type { UserPreferences } from "@/api/userPreferences";
import { STORAGE_KEYS } from "@/utils/storageKeys";

export const DEVICE_SETTINGS_SEEDED_EVENT = "tyto:device-settings-seeded";

const LANGUAGE_STORAGE_KEY = "tyto_language";
const AUTO_POPULATED_THEME = "dark";

function detectedLanguage(): string {
  const match: unknown = i18n.services.languageUtils.getBestMatchFromCodes([
    ...(navigator.languages ?? []),
  ]);
  return typeof match === "string" ? match : "en";
}

function seedIfUnset(storageKey: string, value: string | null): void {
  if (value === null || localStorage.getItem(storageKey) !== null) return;
  localStorage.setItem(storageKey, value);
}

export function isDeviceSettingsSeeded(): boolean {
  return localStorage.getItem(STORAGE_KEYS.DEVICE_PREFS_SEEDED) === "true";
}

export function seedDeviceSettings(prefs: UserPreferences): void {
  const theme = localStorage.getItem(STORAGE_KEYS.THEME);
  if (prefs.theme !== null && (theme === null || theme === AUTO_POPULATED_THEME)) {
    localStorage.setItem(STORAGE_KEYS.THEME, prefs.theme);
  }

  seedIfUnset(STORAGE_KEYS.SUBMIT_KEY, prefs.submitKey);
  seedIfUnset(STORAGE_KEYS.TIMEZONE, prefs.timezone);
  seedIfUnset(
    STORAGE_KEYS.DESKTOP_NOTIFICATIONS,
    prefs.desktopNotifications === null ? null : String(prefs.desktopNotifications),
  );

  const language = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  const languageIsAutoDetected = language === null || language === detectedLanguage();
  if (prefs.locale !== null && prefs.locale !== i18n.resolvedLanguage && languageIsAutoDetected) {
    void i18n.changeLanguage(prefs.locale);
  }

  localStorage.setItem(STORAGE_KEYS.DEVICE_PREFS_SEEDED, "true");
  window.dispatchEvent(new Event(DEVICE_SETTINGS_SEEDED_EVENT));
}
