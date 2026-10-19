import { beforeEach, describe, expect, it } from "vitest";
import { configureApiClient } from "@/api/client";
import { extractFirstPermalink } from "@/utils/extractFirstPermalink";

const ORIGIN = "https://app.example.com";
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

beforeEach(() => configureApiClient(`${ORIGIN}/api/v1`));

describe("extractFirstPermalink", () => {
  it("returns null for empty input", () => {
    expect(extractFirstPermalink("")).toBeNull();
  });

  it("returns null when no internal link is present", () => {
    expect(extractFirstPermalink('<p><a data-external-link="https://e.com">x</a></p>')).toBeNull();
  });

  it("returns the target of the first internal link with its origin", () => {
    const html = `<p><a data-internal-link="${A}" data-internal-origin="https://b.example">link</a></p>`;
    expect(extractFirstPermalink(html)).toEqual({ origin: "https://b.example", uuid: A });
  });

  it("falls back to the current server origin when the origin attribute is missing", () => {
    const html = `<p><a data-internal-link="${A}">link</a></p>`;
    expect(extractFirstPermalink(html)).toEqual({ origin: ORIGIN, uuid: A });
  });

  it("returns only the first when multiple are present", () => {
    const html = `<p><a data-internal-link="${A}">x</a> and <a data-internal-link="${B}">y</a></p>`;
    expect(extractFirstPermalink(html)?.uuid).toBe(A);
  });

  it("short-circuits on large plain bodies", () => {
    expect(extractFirstPermalink(`<p>${"x".repeat(10_000)}</p>`)).toBeNull();
  });
});
