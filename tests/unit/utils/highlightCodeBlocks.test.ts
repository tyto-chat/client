import { describe, expect, it } from "vitest";
import { highlightCodeBlocks } from "@/utils/highlightHtml";

function codeText(html: string): string {
  return (
    new DOMParser().parseFromString(html, "text/html").querySelector("pre code")?.textContent ?? ""
  );
}

describe("highlightCodeBlocks", () => {
  it("keeps text that no language matches", () => {
    const text = "fdfdsfdsfds\nsddsadsadsa\ndsadsa\n";
    const html = highlightCodeBlocks(`<pre><code>${text}</code></pre>`);
    expect(codeText(html)).toBe(text);
    expect(html).toContain("data-copy-btn");
  });

  it("highlights recognised code without changing its text", () => {
    const text = "const a = 1;\nconsole.log(a);\n";
    const html = highlightCodeBlocks(`<pre><code class="language-javascript">${text}</code></pre>`);
    expect(codeText(html)).toBe(text);
    expect(html).toContain("hljs-");
  });

  it("escapes markup inside unrecognised text", () => {
    const html = highlightCodeBlocks("<pre><code>qwqw &lt;b&gt;zz&lt;/b&gt;</code></pre>");
    expect(codeText(html)).toBe("qwqw <b>zz</b>");
    expect(html).not.toContain("<b>");
  });
});
