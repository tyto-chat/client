import { describe, it, expect } from "vitest";
import { extractPermalinkUuids } from "@/utils/extractPermalinkUuids";

const ORIGIN = "https://app.example.com";
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("extractPermalinkUuids", () => {
  it("returns [] for empty input", () => {
    expect(extractPermalinkUuids(null)).toEqual([]);
    expect(extractPermalinkUuids("")).toEqual([]);
    expect(extractPermalinkUuids(undefined)).toEqual([]);
  });

  it("returns [] when no /m/ occurs in text", () => {
    expect(extractPermalinkUuids("hello world", ORIGIN)).toEqual([]);
  });

  it("extracts a single same-origin permalink uuid", () => {
    expect(extractPermalinkUuids(`see ${ORIGIN}/m/${A}`, ORIGIN)).toEqual([A]);
  });

  it("dedupes repeats", () => {
    const text = `first ${ORIGIN}/m/${A} then ${ORIGIN}/m/${A} again`;
    expect(extractPermalinkUuids(text, ORIGIN)).toEqual([A]);
  });

  it("returns multiple distinct uuids in encounter order", () => {
    const text = `a ${ORIGIN}/m/${A} and b ${ORIGIN}/m/${B}`;
    expect(extractPermalinkUuids(text, ORIGIN)).toEqual([A, B]);
  });

  it("ignores foreign-origin /m/<uuid> URLs", () => {
    const text = `look https://other.example/m/${A}`;
    expect(extractPermalinkUuids(text, ORIGIN)).toEqual([]);
  });
});
