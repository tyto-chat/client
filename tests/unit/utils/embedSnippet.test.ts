import { describe, it, expect } from "vitest";
import { buildEmbedSnippet, stripToPlaintext } from "@/utils/embedSnippet";

const UUID = "3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d";
const ORIGIN = "https://tyto.example";

describe("buildEmbedSnippet", () => {
  it("returns a blockquote + script snippet wired to the origin and uuid", () => {
    const snippet = buildEmbedSnippet({
      origin: ORIGIN,
      uuid: UUID,
      fallbackText: "Hello world",
      authorName: "Alice",
      channelLabel: "#general",
    });

    expect(snippet).toContain('class="tyto-embed"');
    expect(snippet).toContain(`data-tyto-message="${UUID}"`);
    expect(snippet).toContain(`<a href="${ORIGIN}/m/${UUID}">`);
    expect(snippet).toContain(`<script async src="${ORIGIN}/embed.js"></script>`);
  });

  it("truncates fallback text longer than 280 chars with a trailing ellipsis", () => {
    const longText = "a".repeat(300);
    const snippet = buildEmbedSnippet({
      origin: ORIGIN,
      uuid: UUID,
      fallbackText: longText,
      authorName: "Alice",
      channelLabel: "#general",
    });

    expect(snippet).toContain("a".repeat(280) + "…");
    expect(snippet).not.toContain("a".repeat(281));
  });

  it("HTML-escapes fallbackText and authorName so third-party embed markup can't inject tags", () => {
    const snippet = buildEmbedSnippet({
      origin: ORIGIN,
      uuid: UUID,
      fallbackText: "<img onerror=x>",
      authorName: '<script>alert("x")</script>',
      channelLabel: "#general",
    });

    expect(snippet).not.toContain("<img onerror=x>");
    expect(snippet).toContain("&lt;img");
    expect(snippet).not.toContain("<script>alert");
    expect(snippet).toContain("&lt;script&gt;");
  });

  it("rejects a uuid that doesn't match the UUID shape instead of interpolating it raw", () => {
    const hostileUuid = 'x" onmouseover="alert(1)';
    expect(() =>
      buildEmbedSnippet({
        origin: ORIGIN,
        uuid: hostileUuid,
        fallbackText: "Hello world",
        authorName: "Alice",
        channelLabel: "#general",
      }),
    ).toThrow();
  });

  it("escapes the origin when interpolating it into attributes", () => {
    const hostileOrigin = 'https://evil.example"><script>alert(1)</script>';
    const snippet = buildEmbedSnippet({
      origin: hostileOrigin,
      uuid: UUID,
      fallbackText: "Hello world",
      authorName: "Alice",
      channelLabel: "#general",
    });

    expect(snippet).not.toContain('"><script>alert(1)</script>');
    expect(snippet).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("stripToPlaintext", () => {
  it("strips tags and decodes entities via an inert DOMParser", () => {
    expect(stripToPlaintext("<p>Hello <b>world</b> &amp; friends</p>")).toBe(
      "Hello world & friends",
    );
  });

  it("returns an empty string for empty input", () => {
    expect(stripToPlaintext("")).toBe("");
  });
});
