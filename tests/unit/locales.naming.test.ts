import { describe, it, expect } from "vitest";

const files = import.meta.glob<Record<string, unknown>>("/src/locales/*/*.json", {
  eager: true,
  import: "default",
});

function values(node: Record<string, unknown>, prefix: string): [string, string][] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = `${prefix}.${key}`;
    if (typeof value === "string") return [[path, value] as [string, string]];
    if (value !== null && typeof value === "object") {
      return values(value as Record<string, unknown>, path);
    }
    return [];
  });
}

const LOWERCASE_STANDALONE = /(?<![\w./:-])tyto(?![\w.:_/-])/;

describe("product naming in translations", () => {
  it("writes the short name as Tyto and the full name as tyto.chat", () => {
    const offenders = Object.entries(files).flatMap(([file, content]) =>
      values(content, file.replace("/src/locales/", ""))
        .filter(([, text]) => LOWERCASE_STANDALONE.test(text))
        .map(([path, text]) => `${path}: ${text}`),
    );

    expect(offenders).toEqual([]);
  });

  it("leaves identifiers alone", () => {
    expect(LOWERCASE_STANDALONE.test("php bin/console tyto:retention:purge")).toBe(false);
    expect(LOWERCASE_STANDALONE.test("Visit tyto.chat")).toBe(false);
    expect(LOWERCASE_STANDALONE.test("tyto://open")).toBe(false);
    expect(LOWERCASE_STANDALONE.test("github.com/tyto-chat/client")).toBe(false);
    expect(LOWERCASE_STANDALONE.test("Open tyto")).toBe(true);
    expect(LOWERCASE_STANDALONE.test("tyto desktop")).toBe(true);
  });

  it("never capitalises the full name", () => {
    const offenders = Object.entries(files).flatMap(([file, content]) =>
      values(content, file.replace("/src/locales/", ""))
        .filter(([, text]) => /Tyto\.chat|TYTO\.CHAT/.test(text))
        .map(([path]) => path),
    );

    expect(offenders).toEqual([]);
  });
});
