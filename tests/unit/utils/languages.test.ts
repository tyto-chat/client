import { describe, it, expect } from "vitest";
import { buildLanguageOptions, isSupportedLanguage, languageLabel } from "@/utils/languages";

describe("buildLanguageOptions", () => {
  it("puts catalog-backed languages first, alphabetical within groups", () => {
    const options = buildLanguageOptions("en");
    const supportedCount = options.filter((o) => o.supported).length;

    expect(supportedCount).toBe(10);
    expect(options.slice(0, supportedCount).every((o) => o.supported)).toBe(true);
    expect(options.slice(supportedCount).every((o) => !o.supported)).toBe(true);
  });

  it("includes languages without a catalog", () => {
    const options = buildLanguageOptions("en");
    const ja = options.find((o) => o.code === "ja");

    expect(ja).toBeDefined();
    expect(ja?.supported).toBe(false);
    expect(ja?.label).toBe("Japanese");
    expect(ja?.nativeLabel).toBe("日本語");
  });

  it("localizes labels to the display locale", () => {
    const options = buildLanguageOptions("pl");
    const de = options.find((o) => o.code === "de");

    expect(de?.label).toBe("niemiecki");
    expect(de?.nativeLabel).toBe("Deutsch");
  });
});

describe("isSupportedLanguage", () => {
  it("knows the catalog set", () => {
    expect(isSupportedLanguage("pl")).toBe(true);
    expect(isSupportedLanguage("ja")).toBe(false);
  });
});

describe("languageLabel", () => {
  it("resolves a name and falls back to the code", () => {
    expect(languageLabel("fr", "en")).toBe("French");
    expect(languageLabel("zz", "en")).toBe("zz");
  });
});
