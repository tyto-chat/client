import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { isPristineDoc } from "@/utils/isPristineDoc";

function docFor(content: string) {
  const editor = new Editor({ extensions: [StarterKit], content });
  const doc = editor.state.doc;
  return { doc, isEmpty: editor.isEmpty, destroy: () => editor.destroy() };
}

describe("isPristineDoc", () => {
  it("is true for the untouched editor (one empty paragraph)", () => {
    const { doc, destroy } = docFor("");
    expect(isPristineDoc(doc)).toBe(true);
    destroy();
  });

  it("is false once any text exists", () => {
    const { doc, destroy } = docFor("<p>hi</p>");
    expect(isPristineDoc(doc)).toBe(false);
    destroy();
  });

  it.each([
    ["bullet list", "<ul><li><p></p></li></ul>"],
    ["ordered list", "<ol><li><p></p></li></ol>"],
    ["blockquote", "<blockquote><p></p></blockquote>"],
    ["heading", "<h1></h1>"],
    ["code block", "<pre><code></code></pre>"],
    ["two paragraphs", "<p></p><p></p>"],
  ])("is false for an empty %s, which Tiptap still reports as empty", (_label, html) => {
    const { doc, isEmpty, destroy } = docFor(html);
    expect(isEmpty).toBe(true);
    expect(isPristineDoc(doc)).toBe(false);
    destroy();
  });
});
