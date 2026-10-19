import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractPermalinkTargets } from "@/utils/extractPermalinkTargets";
import { configureApiClient } from "@/api/client";
import {
  clearFakeDirectory,
  fakeEndpoint,
  registerFakeDirectory,
} from "../../mocks/serverDirectory";

const ORIGIN = "https://app.example.com";
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

beforeEach(() => configureApiClient(`${ORIGIN}/api/v1`));
afterEach(clearFakeDirectory);

describe("extractPermalinkTargets", () => {
  it("returns [] for empty input", () => {
    expect(extractPermalinkTargets(null)).toEqual([]);
    expect(extractPermalinkTargets("")).toEqual([]);
    expect(extractPermalinkTargets(undefined)).toEqual([]);
  });

  it("returns [] when no permalink is present", () => {
    expect(extractPermalinkTargets("hello world", [ORIGIN])).toEqual([]);
  });

  it("finds a permalink on the given origin", () => {
    expect(extractPermalinkTargets(`see ${ORIGIN}/m/${A}`, [ORIGIN])).toEqual([
      { origin: ORIGIN, uuid: A },
    ]);
  });

  it("de-duplicates by origin and uuid, keeping order", () => {
    const text = `${ORIGIN}/m/${A} and ${ORIGIN}/m/${B} and ${ORIGIN}/m/${A}`;
    expect(extractPermalinkTargets(text, [ORIGIN])).toEqual([
      { origin: ORIGIN, uuid: A },
      { origin: ORIGIN, uuid: B },
    ]);
  });

  it("ignores permalinks on other origins", () => {
    expect(extractPermalinkTargets(`https://other.example/m/${A}`, [ORIGIN])).toEqual([]);
  });

  it("finds a permalink on an added server by default", () => {
    registerFakeDirectory([fakeEndpoint("ib", "https://b.example")], "ia");
    expect(extractPermalinkTargets(`https://b.example/m/${A}`)).toEqual([
      { origin: "https://b.example", uuid: A },
    ]);
  });

  it("ignores an unknown host and a lookalike by default", () => {
    registerFakeDirectory([fakeEndpoint("ib", "https://b.example")], "ia");
    expect(
      extractPermalinkTargets(`https://b.example.evil.com/m/${A} https://x.example/m/${B}`),
    ).toEqual([]);
  });

  it("normalises an upper-case origin and uuid to lower case", () => {
    registerFakeDirectory([fakeEndpoint("ib", "https://b.example")], "ia");
    expect(extractPermalinkTargets(`HTTPS://B.EXAMPLE/m/${A.toUpperCase()}`)).toEqual([
      { origin: "https://b.example", uuid: A },
    ]);
  });

  it("covers the current server by default", () => {
    expect(extractPermalinkTargets(`${ORIGIN}/m/${A}`)).toEqual([{ origin: ORIGIN, uuid: A }]);
  });
});
