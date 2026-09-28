import { describe, it, expect } from "vitest";

const files = import.meta.glob<Record<string, unknown>>("/src/locales/*/*.json", {
  eager: true,
  import: "default",
});

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function baseKeys(node: Record<string, unknown>, prefix = ""): Set<string> {
  const out = new Set<string>();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") {
      for (const nested of baseKeys(value as Record<string, unknown>, path)) out.add(nested);
    } else {
      out.add(path.replace(PLURAL_SUFFIX, ""));
    }
  }
  return out;
}

const byLocale = new Map<string, Map<string, Set<string>>>();
for (const [path, content] of Object.entries(files)) {
  const [, locale, namespace] = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path)!;
  if (!byLocale.has(locale!)) byLocale.set(locale!, new Map());
  byLocale.get(locale!)!.set(namespace!, baseKeys(content));
}

const reference = byLocale.get("en")!;
const cases = [...byLocale.keys()]
  .filter((locale) => locale !== "en")
  .flatMap((locale) => [...reference.keys()].map((namespace) => [locale, namespace] as const));

describe("locale parity with en", () => {
  it("covers every shipped locale", () => {
    expect(byLocale.size).toBe(10);
  });

  it.each(cases)("%s/%s has exactly the en keys", (locale, namespace) => {
    const expected = reference.get(namespace)!;
    const actual = byLocale.get(locale)?.get(namespace) ?? new Set<string>();

    const missing = [...expected].filter((key) => !actual.has(key));
    const extra = [...actual].filter((key) => !expected.has(key));

    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });
});
