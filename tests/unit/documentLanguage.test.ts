import { describe, it, expect, afterEach } from "vitest";
import { applyDocumentLanguage } from "@/i18n";

afterEach(() => {
  document.documentElement.lang = "en";
});

describe("applyDocumentLanguage", () => {
  it("reflects the active language on the document element", () => {
    applyDocumentLanguage("pl");
    expect(document.documentElement.lang).toBe("pl");
  });

  it("strips the region subtag", () => {
    applyDocumentLanguage("pt-BR");
    expect(document.documentElement.lang).toBe("pt");
  });

  it("leaves the current value alone for an empty language", () => {
    applyDocumentLanguage("de");
    applyDocumentLanguage("");
    expect(document.documentElement.lang).toBe("de");
  });
});
