import { useTranslation } from "react-i18next";
import { useFontSize, type FontSize } from "@/context/FontSizeContext";
import { useTheme } from "@/context/ThemeContext";
import { useTimezone } from "@/context/TimezoneContext";
import { useAuth } from "@/hooks/useAuth";
import i18n, { SUPPORTED_LANGUAGES } from "@/i18n";
import { useUpdateUserPreference } from "@/queries/userPreferencesQueries";
import type { UserLocale } from "@/api/userPreferences";
import { SettingRow } from "@/components/preferences/SettingRow";
import {
  segBase,
  segActive,
  segInactive,
  sectionHeading,
} from "@/components/preferences/panelStyles";

const FONT_SIZES: { value: FontSize }[] = [{ value: "100%" }, { value: "125%" }, { value: "150%" }];

const TIMEZONES = Intl.supportedValuesOf("timeZone");

export function GeneralPanel() {
  const { t } = useTranslation("settings");
  const { fontSize, setFontSize } = useFontSize();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const { timezone, setTimezone } = useTimezone();
  const { user } = useAuth();
  const updatePreference = useUpdateUserPreference();

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className={sectionHeading}>{t("general_appearance")}</h3>
        <div className="flex flex-col gap-2">
          <SettingRow label={t("theme")}>
            {(["system", "light", "dark"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setThemePreference(value)}
                className={`${segBase} ${themePreference === value ? segActive : segInactive}`}
              >
                <span className="block cap-trim">{t(`theme_${value}`)}</span>
              </button>
            ))}
          </SettingRow>
          <SettingRow label={t("interface_scale")}>
            {FONT_SIZES.map(({ value }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFontSize(value)}
                className={`${segBase} ${fontSize === value ? segActive : segInactive}`}
              >
                <span className="block cap-trim">{value}</span>
              </button>
            ))}
          </SettingRow>
        </div>
      </section>

      <section>
        <h3 className={sectionHeading}>{t("general_language_region")}</h3>
        <div className="flex flex-col gap-2">
          {SUPPORTED_LANGUAGES.length > 1 && (
            <SettingRow label={t("language")}>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-3">
                {SUPPORTED_LANGUAGES.map(({ code, label, flag }) => (
                  <button
                    key={code}
                    type="button"
                    data-testid={`lang-${code}`}
                    aria-label={label}
                    title={label}
                    onClick={() => {
                      void i18n.changeLanguage(code);
                      if (user) updatePreference.mutate({ locale: code as UserLocale });
                    }}
                    className={`inline-flex items-center justify-center ${segBase} ${i18n.resolvedLanguage === code ? segActive : segInactive}`}
                  >
                    <span aria-hidden className="block emoji-glyph">
                      {flag}
                    </span>
                    <span className="hidden cap-trim sm:ml-1.5 sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </SettingRow>
          )}
          <SettingRow label={t("timezone")}>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </SettingRow>
        </div>
      </section>
    </div>
  );
}
