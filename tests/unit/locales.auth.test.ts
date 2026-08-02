import { describe, it, expect } from "vitest";
import en from "@/locales/en/auth.json";
import pl from "@/locales/pl/auth.json";
import de from "@/locales/de/auth.json";
import fr from "@/locales/fr/auth.json";
import es from "@/locales/es/auth.json";
import it_ from "@/locales/it/auth.json";
import nl from "@/locales/nl/auth.json";
import pt from "@/locales/pt/auth.json";
import tr from "@/locales/tr/auth.json";
import uk from "@/locales/uk/auth.json";

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

const REQUIRED = [
  "powered_by",
  "communities_subtitle",
  "communities_filter",
  "communities_filter_empty",
  "browse_as_guest",
  "stats_online",
  "register_prompt",
  "terms_of_service",
  "terms_of_service_consent",
  "privacy_policy",
  "privacy_policy_consent",
];

describe("auth locale files", () => {
  it.each(Object.keys(locales))("%s has every new key", (locale) => {
    for (const key of REQUIRED) {
      expect(locales[locale]![key], `${locale}:${key}`).toBeTruthy();
    }
  });

  it("keeps inflected consent forms separate where grammar requires it", () => {
    expect(pl.privacy_policy).toBe("Polityka prywatności");
    expect(pl.privacy_policy_consent).toBe("Politykę prywatności");
    expect(uk.privacy_policy).toBe("Політика конфіденційності");
    expect(uk.privacy_policy_consent).toBe("Політикою конфіденційності");
    expect(uk.terms_of_service).toBe("Умови надання послуг");
    expect(uk.terms_of_service_consent).toBe("Умовами надання послуг");
  });
});
