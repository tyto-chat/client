import { describe, it, expect } from "vitest";
import en from "@/locales/en/notifications.json";
import pl from "@/locales/pl/notifications.json";
import de from "@/locales/de/notifications.json";
import fr from "@/locales/fr/notifications.json";
import es from "@/locales/es/notifications.json";
import it_ from "@/locales/it/notifications.json";
import nl from "@/locales/nl/notifications.json";
import pt from "@/locales/pt/notifications.json";
import tr from "@/locales/tr/notifications.json";
import uk from "@/locales/uk/notifications.json";

const locales: Record<string, Record<string, unknown>> = {
  en,
  pl,
  de,
  fr,
  es,
  it: it_,
  nl,
  pt,
  tr,
  uk,
};

const REQUIRED = ["desktop_title", "from_server"];

describe("notifications locale files (desktop plan 2 keys)", () => {
  it.each(Object.keys(locales))("%s has every new key", (locale) => {
    for (const key of REQUIRED) {
      expect(locales[locale]![key], `${locale}:${key}`).toBeTruthy();
    }
  });
});
