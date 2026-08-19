import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { loadEmojiLabels } from "@/utils/emojiNameI18n";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "uk", label: "Українська", flag: "🇺🇦" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const NAMESPACES = [
  "common",
  "auth",
  "channel",
  "community",
  "conversation",
  "settings",
  "notifications",
  "admin",
  "reports",
  "appeals",
  "desktop",
] as const;

export const i18nReady = i18n
  .use(LanguageDetector)
  .use(
    resourcesToBackend(
      (language: string, namespace: string) => import(`./locales/${language}/${namespace}.json`),
    ),
  )
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    defaultNS: "common",
    ns: NAMESPACES,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "tyto_language",
    },
  })
  .then(() => {
    applyDocumentLanguage(i18n.language);
    return loadEmojiLabels(i18n.language);
  })
  .catch(() => {});

export function applyDocumentLanguage(lng: string): void {
  if (typeof document === "undefined" || !lng) return;
  document.documentElement.lang = lng.split("-")[0] ?? lng;
}

i18n.on("languageChanged", (lng) => {
  applyDocumentLanguage(lng);
  void loadEmojiLabels(lng);
});

export default i18n;
