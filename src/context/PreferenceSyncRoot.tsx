import { useEffect, useRef } from "react";
import i18n, { SUPPORTED_LANGUAGES } from "@/i18n";
import { useUpdateUserPreference, useUserPreferences } from "@/queries/userPreferencesQueries";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import type {
  UserLocale,
  UserPreferencesPatch,
  UserSubmitKey,
  UserTheme,
} from "@/api/userPreferences";

export function PreferenceSyncRoot() {
  const { data, isSuccess } = useUserPreferences();
  const updatePref = useUpdateUserPreference();
  const migratedRef = useRef(false);

  useEffect(() => {
    if (!isSuccess || !data) return;

    if (data.sendTypingIndicator !== null) {
      localStorage.setItem(
        STORAGE_KEYS.SEND_TYPING_INDICATOR,
        data.sendTypingIndicator ? "true" : "false",
      );
    }

    if (data.desktopNotifications !== null) {
      localStorage.setItem(
        STORAGE_KEYS.DESKTOP_NOTIFICATIONS,
        data.desktopNotifications ? "true" : "false",
      );
    }

    if (data.convertEmoticons !== null) {
      localStorage.setItem(
        STORAGE_KEYS.CONVERT_EMOTICONS,
        data.convertEmoticons ? "true" : "false",
      );
    }

    if (data.locale && i18n.resolvedLanguage !== data.locale) {
      void i18n.changeLanguage(data.locale);
    }

    if (!migratedRef.current && localStorage.getItem(STORAGE_KEYS.PREFS_MIGRATED) !== "true") {
      migratedRef.current = true;
      const patch = buildMigrationPatch(data);
      if (Object.keys(patch).length > 0) {
        updatePref.mutate(patch, {
          onSuccess: () => localStorage.setItem(STORAGE_KEYS.PREFS_MIGRATED, "true"),
        });
      } else {
        localStorage.setItem(STORAGE_KEYS.PREFS_MIGRATED, "true");
      }
    }
  }, [isSuccess, data, updatePref]);

  return null;
}

const THEME_VALUES: readonly UserTheme[] = ["system", "light", "dark"];
const SUBMIT_KEY_VALUES: readonly UserSubmitKey[] = ["enter", "shift+enter", "ctrl+enter", "none"];
const LOCALE_VALUES: readonly UserLocale[] = SUPPORTED_LANGUAGES.map((l) => l.code);

function buildMigrationPatch(server: {
  [K in keyof UserPreferencesPatch]: unknown;
}): UserPreferencesPatch {
  const patch: UserPreferencesPatch = {};

  const theme = localStorage.getItem(STORAGE_KEYS.THEME);
  if (server.theme === null && theme && (THEME_VALUES as readonly string[]).includes(theme)) {
    patch.theme = theme as UserTheme;
  }

  const submitKey = localStorage.getItem(STORAGE_KEYS.SUBMIT_KEY);
  if (
    server.submitKey === null &&
    submitKey &&
    (SUBMIT_KEY_VALUES as readonly string[]).includes(submitKey)
  ) {
    patch.submitKey = submitKey as UserSubmitKey;
  }

  const locale = i18n.resolvedLanguage;
  if (server.locale === null && locale && (LOCALE_VALUES as readonly string[]).includes(locale)) {
    patch.locale = locale as UserLocale;
  }

  const tz = localStorage.getItem(STORAGE_KEYS.TIMEZONE);
  if (server.timezone === null && tz) {
    patch.timezone = tz;
  }

  const sendTyping = localStorage.getItem(STORAGE_KEYS.SEND_TYPING_INDICATOR);
  if (server.sendTypingIndicator === null && sendTyping !== null) {
    patch.sendTypingIndicator = sendTyping === "true";
  }

  const desktop = localStorage.getItem(STORAGE_KEYS.DESKTOP_NOTIFICATIONS);
  if (server.desktopNotifications === null && desktop !== null) {
    patch.desktopNotifications = desktop === "true";
  }

  const emoticons = localStorage.getItem(STORAGE_KEYS.CONVERT_EMOTICONS);
  if (server.convertEmoticons === null && emoticons !== null) {
    patch.convertEmoticons = emoticons === "true";
  }

  return patch;
}
