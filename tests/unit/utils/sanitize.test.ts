/**
 * @vitest-environment jsdom
 *
 * DOMPurify (3.4+) degrades under happy-dom — it can't fully trust that DOM and
 * falls into a no-op/partial path, so sanitization silently passes markup
 * through. jsdom is DOMPurify's canonical, fully-supported test environment;
 * pin just this file to it (the rest of the suite stays on the faster happy-dom).
 */
import { describe, it, expect } from "vitest";
import { sanitizeMessageHtml } from "@/utils/sanitize";

describe("sanitizeMessageHtml", () => {
  it("passes through safe tags unchanged", () => {
    const html = "<p><strong>Hello</strong> <em>world</em></p>";
    expect(sanitizeMessageHtml(html)).toContain("Hello");
    expect(sanitizeMessageHtml(html)).toContain("<strong>");
  });

  it("strips <script> tags", () => {
    const html = '<script>alert("xss")</script><p>safe</p>';
    const result = sanitizeMessageHtml(html);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("safe");
  });

  it("strips inline event handlers", () => {
    const html = '<p onclick="evil()">click me</p>';
    const result = sanitizeMessageHtml(html);
    expect(result).not.toContain("onclick");
  });

  it("keeps <img> but strips dangerous attributes", () => {
    const html = '<p>text</p><img src="x" onerror="evil()" alt=":tyto:">';
    const result = sanitizeMessageHtml(html);
    expect(result).toContain("<img");
    expect(result).toContain('alt=":tyto:"');
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("evil");
  });

  it("strips javascript: hrefs", () => {
    const html = '<a href="javascript:evil()">click</a>';
    const result = sanitizeMessageHtml(html);
    expect(result).not.toContain("javascript:");
  });

  it("allows class and data attributes", () => {
    const html = '<span class="mention" data-user-id="1">@user</span>';
    const result = sanitizeMessageHtml(html);
    expect(result).toContain('class="mention"');
    expect(result).toContain('data-user-id="1"');
  });

  it("keeps data-broadcast for @channel / @here pills", () => {
    const html = '<span class="mention-broadcast" data-broadcast="channel">@channel</span>';
    const result = sanitizeMessageHtml(html);
    expect(result).toContain('class="mention-broadcast"');
    expect(result).toContain('data-broadcast="channel"');
  });
});
