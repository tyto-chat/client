import { describe, it, expect } from "vitest";
import { htmlToMarkdown, markdownToHtml } from "@/utils/markdownConverter";

describe("markdownConverter — broadcast mentions", () => {
  it("turns a broadcast span into [@scope](broadcast:scope)", () => {
    const html =
      '<p>hey <span class="mention-broadcast" data-broadcast="channel">@channel</span></p>';
    expect(htmlToMarkdown(html)).toContain("[@channel](broadcast:channel)");
  });

  it("handles @here just as well", () => {
    const html = '<p><span class="mention-broadcast" data-broadcast="here">@here</span></p>';
    expect(htmlToMarkdown(html)).toContain("[@here](broadcast:here)");
  });

  it("renders [@channel](broadcast:channel) to an anchor that the renderer recognises", () => {
    const html = markdownToHtml("hey [@channel](broadcast:channel)!");
    // marked emits <a href="broadcast:channel">@channel</a>; MessageContent
    // rewrites it into the span. Here we just lock in the marked output shape
    // since that's what the rewrite step depends on.
    expect(html).toMatch(/<a[^>]+href="broadcast:channel"[^>]*>@channel<\/a>/);
  });
});
