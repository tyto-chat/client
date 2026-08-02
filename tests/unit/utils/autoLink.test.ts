import { describe, it, expect } from "vitest";
import { autoLinkUrls } from "@/utils/autoLink";

describe("autoLinkUrls", () => {
  it("converts a plain URL in text to an anchor", () => {
    const result = autoLinkUrls("<p>Visit https://example.com today</p>");
    expect(result).toContain("<a");
    expect(result).toContain('href="https://example.com"');
  });

  it("truncates long URLs in display text", () => {
    const longUrl = "https://example.com/" + "a".repeat(70);
    const result = autoLinkUrls(`<p>${longUrl}</p>`);
    expect(result).toContain("…");
  });

  it("strips trailing punctuation from URLs", () => {
    const result = autoLinkUrls("<p>See https://example.com.</p>");
    const match = result.match(/href="([^"]+)"/);
    expect(match?.[1]).toBe("https://example.com");
  });

  it("does not linkify URLs inside <a> tags", () => {
    const html = '<p><a href="https://example.com">https://example.com</a></p>';
    const result = autoLinkUrls(html);
    // Should still have exactly one <a> tag, not two
    const count = (result.match(/<a /g) ?? []).length;
    expect(count).toBe(1);
  });

  it("does not linkify URLs inside <code> blocks", () => {
    const html = "<p><code>https://example.com</code></p>";
    const result = autoLinkUrls(html);
    expect(result).not.toContain("<a");
  });

  it("leaves HTML without URLs unchanged", () => {
    const html = "<p>Hello world</p>";
    expect(autoLinkUrls(html)).toBe(html);
  });

  it("tags same-origin /m/<uuid> permalinks with data-internal-link", () => {
    const origin = window.location.origin;
    const uuid = "3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d";
    const result = autoLinkUrls(`<p>see ${origin}/m/${uuid}</p>`);
    expect(result).toContain(`data-internal-link="${uuid}"`);
    expect(result).not.toContain("data-external-link");
  });

  it("tags external URLs with data-external-link", () => {
    const result = autoLinkUrls("<p>see https://example.com/m/foo</p>");
    expect(result).toContain('data-external-link="https://example.com/m/foo"');
    expect(result).not.toContain("data-internal-link");
  });

  it("treats same-origin non-permalink URLs as external", () => {
    const origin = window.location.origin;
    const result = autoLinkUrls(`<p>see ${origin}/some/other/page</p>`);
    expect(result).toContain("data-external-link");
    expect(result).not.toContain("data-internal-link");
  });
});
