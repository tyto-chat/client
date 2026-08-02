import { describe, it, expect } from "vitest";
import { listCategories, listEmojisInCategory, searchUnicode } from "@/utils/emojiCatalog";

describe("emojiCatalog", () => {
  it("exposes the 8 standard categories", async () => {
    const ids = (await listCategories()).map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "people",
        "nature",
        "foods",
        "activity",
        "places",
        "objects",
        "symbols",
        "flags",
      ]),
    );
  });

  it("returns emojis with glyph + name for a category", async () => {
    const people = await listEmojisInCategory("people");
    expect(people.length).toBeGreaterThan(20);
    expect(people[0]).toMatchObject({
      id: expect.any(String),
      glyph: expect.any(String),
      name: expect.any(String),
    });
  });

  it("searches by keyword", async () => {
    const results = await searchUnicode("smile");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.glyph)).toBe(true);
  });

  it("empty query returns no results", async () => {
    expect(await searchUnicode("")).toEqual([]);
  });

  it("nonsense query returns no results", async () => {
    expect(await searchUnicode("zzzznonexistent")).toEqual([]);
  });
});
