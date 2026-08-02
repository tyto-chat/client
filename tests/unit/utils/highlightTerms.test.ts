import { describe, it, expect } from "vitest";
import { extractMarkedTerms, highlightTerms } from "@/utils/highlightTerms";

describe("highlightTerms", () => {
  it("wraps matching substrings in <mark>", () => {
    const out = highlightTerms("<p>hello world</p>", ["world"]);
    expect(out).toBe("<p>hello <mark>world</mark></p>");
  });

  it("is case-insensitive", () => {
    const out = highlightTerms("<p>Hello World</p>", ["world"]);
    expect(out).toBe("<p>Hello <mark>World</mark></p>");
  });

  it("returns input unchanged when no terms match", () => {
    const out = highlightTerms("<p>hello world</p>", ["zzz"]);
    expect(out).toBe("<p>hello world</p>");
  });

  it("returns input unchanged for empty/short term list", () => {
    expect(highlightTerms("<p>hello</p>", [])).toBe("<p>hello</p>");
    expect(highlightTerms("<p>hello</p>", ["", "a"])).toBe("<p>hello</p>");
  });

  it("skips text inside <code> and <pre>", () => {
    const out = highlightTerms("<p>see <code>foo</code> and foo</p>", ["foo"]);
    expect(out).toBe("<p>see <code>foo</code> and <mark>foo</mark></p>");
  });

  it("skips text inside <a> tags", () => {
    const out = highlightTerms('<p><a href="x">foo</a> and foo</p>', ["foo"]);
    expect(out).toBe('<p><a href="x">foo</a> and <mark>foo</mark></p>');
  });

  it("skips mention spans", () => {
    const html = '<p><span class="mention-user" data-user-id="1">@alice</span> and alice</p>';
    const out = highlightTerms(html, ["alice"]);
    expect(out).toContain('class="mention-user"');
    expect(out).toContain("<mark>alice</mark>");
    // Mention text itself should NOT be marked
    expect(out).toMatch(/mention-user"[^>]*>@alice<\/span>/);
  });

  it("escapes regex metacharacters in terms", () => {
    const out = highlightTerms("<p>a.b and a*b</p>", ["a.b"]);
    expect(out).toBe("<p><mark>a.b</mark> and a*b</p>");
  });

  it("escapes HTML in matched text to prevent XSS", () => {
    const out = highlightTerms("<p>&lt;script&gt;foo</p>", ["foo"]);
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("<mark>foo</mark>");
    expect(out).not.toContain("<script>");
  });

  it("prefers longer terms first", () => {
    const out = highlightTerms("<p>foobar</p>", ["foo", "foobar"]);
    expect(out).toBe("<p><mark>foobar</mark></p>");
  });
});

describe("extractMarkedTerms", () => {
  it("returns [] for empty input", () => {
    expect(extractMarkedTerms(null)).toEqual([]);
    expect(extractMarkedTerms("")).toEqual([]);
  });

  it("pulls <mark> contents and dedupes", () => {
    const snippet = "hello <mark>world</mark> and <mark>world</mark> again, <mark>foo</mark>";
    expect(extractMarkedTerms(snippet)).toEqual(["world", "foo"]);
  });

  it("ignores marks shorter than 2 chars", () => {
    expect(extractMarkedTerms("a <mark>x</mark> b")).toEqual([]);
  });
});
