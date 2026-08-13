import { describe, it, expect } from "vitest";
import en from "@/locales/en/desktop.json";
import pl from "@/locales/pl/desktop.json";
import de from "@/locales/de/desktop.json";
import fr from "@/locales/fr/desktop.json";
import es from "@/locales/es/desktop.json";
import it_ from "@/locales/it/desktop.json";
import nl from "@/locales/nl/desktop.json";
import pt from "@/locales/pt/desktop.json";
import tr from "@/locales/tr/desktop.json";
import uk from "@/locales/uk/desktop.json";

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

const REQUIRED = Object.keys(en);

describe("desktop locale files", () => {
  it.each(Object.keys(locales))("%s has every key", (locale) => {
    for (const key of REQUIRED) {
      expect(locales[locale]![key], `${locale}:${key}`).toBeTruthy();
    }
  });
});
