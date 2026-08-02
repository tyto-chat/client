import { SUPPORTED_LANGUAGES } from "@/i18n";

// ISO 639-1 set, labels resolved at runtime via Intl.DisplayNames.
const ISO_639_1 = [
  "aa",
  "ab",
  "ae",
  "af",
  "ak",
  "am",
  "an",
  "ar",
  "as",
  "av",
  "ay",
  "az",
  "ba",
  "be",
  "bg",
  "bi",
  "bm",
  "bn",
  "bo",
  "br",
  "bs",
  "ca",
  "ce",
  "ch",
  "co",
  "cr",
  "cs",
  "cu",
  "cv",
  "cy",
  "da",
  "de",
  "dv",
  "dz",
  "ee",
  "el",
  "en",
  "eo",
  "es",
  "et",
  "eu",
  "fa",
  "ff",
  "fi",
  "fj",
  "fo",
  "fr",
  "fy",
  "ga",
  "gd",
  "gl",
  "gn",
  "gu",
  "gv",
  "ha",
  "he",
  "hi",
  "ho",
  "hr",
  "ht",
  "hu",
  "hy",
  "hz",
  "ia",
  "id",
  "ig",
  "ii",
  "ik",
  "io",
  "is",
  "it",
  "iu",
  "ja",
  "jv",
  "ka",
  "kg",
  "ki",
  "kj",
  "kk",
  "kl",
  "km",
  "kn",
  "ko",
  "kr",
  "ks",
  "ku",
  "kv",
  "kw",
  "ky",
  "la",
  "lb",
  "lg",
  "li",
  "ln",
  "lo",
  "lt",
  "lu",
  "lv",
  "mg",
  "mh",
  "mi",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "mt",
  "my",
  "na",
  "nb",
  "nd",
  "ne",
  "ng",
  "nl",
  "nn",
  "no",
  "nr",
  "nv",
  "ny",
  "oc",
  "oj",
  "om",
  "or",
  "os",
  "pa",
  "pi",
  "pl",
  "ps",
  "pt",
  "qu",
  "rm",
  "rn",
  "ro",
  "ru",
  "rw",
  "sa",
  "sc",
  "sd",
  "se",
  "sg",
  "si",
  "sk",
  "sl",
  "sm",
  "sn",
  "so",
  "sq",
  "sr",
  "ss",
  "st",
  "su",
  "sv",
  "sw",
  "ta",
  "te",
  "tg",
  "th",
  "ti",
  "tk",
  "tl",
  "tn",
  "to",
  "tr",
  "ts",
  "tt",
  "tw",
  "ty",
  "ug",
  "uk",
  "ur",
  "uz",
  "ve",
  "vi",
  "vo",
  "wa",
  "wo",
  "xh",
  "yi",
  "yo",
  "za",
  "zh",
  "zu",
] as const;

export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
  supported: boolean;
}

const SUPPORTED_CODES = new Set<string>(SUPPORTED_LANGUAGES.map((l) => l.code));

export function isSupportedLanguage(code: string): boolean {
  return SUPPORTED_CODES.has(code);
}

export function languageLabel(code: string, displayLocale: string): string {
  try {
    return new Intl.DisplayNames([displayLocale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function buildLanguageOptions(displayLocale: string): LanguageOption[] {
  const display = new Intl.DisplayNames([displayLocale], { type: "language" });

  const options: LanguageOption[] = [];
  for (const code of ISO_639_1) {
    let label: string;
    let nativeLabel: string;
    try {
      label = display.of(code) ?? code;
      nativeLabel = new Intl.DisplayNames([code], { type: "language" }).of(code) ?? label;
    } catch {
      continue;
    }
    // Codes the runtime cannot name are noise in a picker.
    if (label === code) continue;
    options.push({ code, label, nativeLabel, supported: SUPPORTED_CODES.has(code) });
  }

  return options.sort((a, b) => {
    if (a.supported !== b.supported) return a.supported ? -1 : 1;
    return a.label.localeCompare(b.label, displayLocale);
  });
}
