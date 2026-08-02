import { describe, it, expect } from "vitest";
import { getUserColor, getUserTextColor } from "@/utils/userColor";

const VALID_COLOR = /^#[0-9a-f]{6}$/i;

describe("getUserColor", () => {
  it("returns a valid hex color", () => {
    expect(getUserColor("/api/profiles/1")).toMatch(VALID_COLOR);
  });

  it("is deterministic — same IRI always returns the same color", () => {
    const iri = "/api/profiles/42";
    expect(getUserColor(iri)).toBe(getUserColor(iri));
  });

  it("returns different colors for different IRIs (not all the same)", () => {
    const colors = new Set(
      Array.from({ length: 20 }, (_, i) => getUserColor(`/api/profiles/${i}`)),
    );
    expect(colors.size).toBeGreaterThan(1);
  });

  it("returns a fallback color (no crash) for null/undefined/empty input", () => {
    expect(getUserColor(undefined)).toMatch(VALID_COLOR);
    expect(getUserColor(null)).toMatch(VALID_COLOR);
    expect(getUserColor("")).toMatch(VALID_COLOR);
  });
});

describe("getUserTextColor", () => {
  it("resolves to a theme-aware CSS variable, not a fixed hex", () => {
    expect(getUserTextColor("/api/profiles/1")).toMatch(/^var\(--user-text-\d+\)$/);
  });

  it("picks the same slot as the avatar fill for a given identity", () => {
    const iri = "/api/profiles/42";
    const slot = getUserTextColor(iri).replace(/\D+/g, "");
    expect(getUserTextColor(iri)).toBe(`var(--user-text-${slot})`);
    expect(getUserColor(iri)).toMatch(VALID_COLOR);
  });

  it("falls back without crashing on null/undefined/empty input", () => {
    expect(getUserTextColor(undefined)).toBe("var(--user-text-0)");
    expect(getUserTextColor(null)).toBe("var(--user-text-0)");
    expect(getUserTextColor("")).toBe("var(--user-text-0)");
  });
});
