import { describe, it, expect } from "vitest";
import {
  accentStrong,
  gradientEnd,
  gradientMidpointRgb,
  hexToRgb,
  onAccentColor,
} from "@/utils/accentGradient";

function luminance([r, g, b]: [number, number, number]): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

describe("gradientEnd", () => {
  it("maps the brand accent to the brand end stop", () => {
    expect(gradientEnd("#22d3ee")).toBe("#a855f7");
  });

  it("hue-rotates any other accent", () => {
    expect(gradientEnd("#ff0000")).toMatch(/^hsl\(38 /);
  });

  it("passes through non-hex values", () => {
    expect(gradientEnd("rebeccapurple")).toBe("rebeccapurple");
  });
});

describe("gradientMidpointRgb", () => {
  it("averages brand start and end stops", () => {
    const start = hexToRgb("#22d3ee");
    const end = hexToRgb("#a855f7");
    expect(gradientMidpointRgb("#22d3ee")).toEqual([
      Math.round((start[0] + end[0]) / 2),
      Math.round((start[1] + end[1]) / 2),
      Math.round((start[2] + end[2]) / 2),
    ]);
  });

  it("brand midpoint is light enough for black text", () => {
    expect(luminance(gradientMidpointRgb("#22d3ee"))).toBeGreaterThan(128);
  });

  it("dark accent midpoint stays dark (white text)", () => {
    expect(luminance(gradientMidpointRgb("#1e293b"))).toBeLessThan(128);
  });

  it("midpoint of a hue-rotated gradient stays near the start's lightness", () => {
    const start = hexToRgb("#dc2626");
    const mid = gradientMidpointRgb("#dc2626");
    expect(Math.abs(luminance(mid) - luminance(start))).toBeLessThan(40);
  });
});

describe("onAccentColor", () => {
  it("keeps the brand gradient white, overriding the contrast rule", () => {
    // Its midpoint is light enough that luminance alone would pick black.
    expect(luminance(gradientMidpointRgb("#22d3ee"))).toBeGreaterThan(128);
    expect(onAccentColor("#22d3ee")).toBe("#ffffff");
  });

  it("is case-insensitive about the brand accent", () => {
    expect(onAccentColor("#22D3EE")).toBe("#ffffff");
  });

  it("still computes black on a light community accent", () => {
    expect(onAccentColor("#f5c542")).toBe("#000000");
  });

  it("still computes white on a dark community accent", () => {
    expect(onAccentColor("#1e293b")).toBe("#ffffff");
  });
});

describe("accentStrong", () => {
  function contrastWithWhite(hsl: string): number {
    const parts = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(hsl);
    if (!parts) throw new Error(`not an hsl() string: ${hsl}`);
    const [h, s, l] = parts.slice(1).map(Number) as [number, number, number];
    const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100);
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l / 100 - c / 2;
    const [r, g, b] =
      h < 60
        ? [c, x, 0]
        : h < 120
          ? [x, c, 0]
          : h < 180
            ? [0, c, x]
            : h < 240
              ? [0, x, c]
              : h < 300
                ? [x, 0, c]
                : [c, 0, x];
    const ch = (v: number) => {
      const n = v + m;
      return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    };
    return 1.05 / (0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b) + 0.05);
  }

  it("darkens the brand accent until white text clears AA", () => {
    expect(contrastWithWhite(accentStrong("#22d3ee"))).toBeGreaterThanOrEqual(4.5);
  });

  it("clears AA for every seeded community accent", () => {
    for (const accent of ["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6"]) {
      expect(contrastWithWhite(accentStrong(accent))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the accent's hue", () => {
    expect(accentStrong("#22d3ee")).toMatch(/^hsl\(188 /);
  });

  it("passes through non-hex values", () => {
    expect(accentStrong("rebeccapurple")).toBe("rebeccapurple");
  });
});
