import { describe, it, expect } from "vitest";
import { extractFirstPermalink } from "@/utils/extractFirstPermalink";

describe("extractFirstPermalink", () => {
  it("returns null for empty input", () => {
    expect(extractFirstPermalink("")).toBeNull();
  });

  it("returns null when no internal link is present", () => {
    expect(extractFirstPermalink('<p><a data-external-link="https://e.com">x</a></p>')).toBeNull();
  });

  it("returns the uuid of the first data-internal-link", () => {
    const uuid = "3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d";
    const html = `<p><a data-internal-link="${uuid}">link</a></p>`;
    expect(extractFirstPermalink(html)).toBe(uuid);
  });

  it("returns only the first when multiple are present", () => {
    const a = "11111111-1111-1111-1111-111111111111";
    const b = "22222222-2222-2222-2222-222222222222";
    const html = `<p><a data-internal-link="${a}">x</a> and <a data-internal-link="${b}">y</a></p>`;
    expect(extractFirstPermalink(html)).toBe(a);
  });

  it("short-circuits when the attribute substring is missing (no DOM parse)", () => {
    // Pure smoke check that the function tolerates large plain bodies.
    const html = `<p>${"x".repeat(10_000)}</p>`;
    expect(extractFirstPermalink(html)).toBeNull();
  });
});
