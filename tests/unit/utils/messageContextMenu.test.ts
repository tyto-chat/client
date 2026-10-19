import { describe, expect, it } from "vitest";
import { wantsNativeContextMenu } from "@/utils/messageContextMenu";

function element(html: string, selector: string): Element {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root.querySelector(selector)!;
}

describe("wantsNativeContextMenu", () => {
  it("leaves links, media and fields to the browser", () => {
    expect(wantsNativeContextMenu(element('<a href="/x"><b>t</b></a>', "b"), "")).toBe(true);
    expect(wantsNativeContextMenu(element('<img alt="" />', "img"), "")).toBe(true);
    expect(wantsNativeContextMenu(element("<video></video>", "video"), "")).toBe(true);
    expect(wantsNativeContextMenu(element("<button>b</button>", "button"), "")).toBe(true);
    expect(wantsNativeContextMenu(element('<div class="tiptap"><p>x</p></div>', "p"), "")).toBe(
      true,
    );
  });

  it("leaves a text selection to the browser", () => {
    expect(wantsNativeContextMenu(element("<p>text</p>", "p"), "some words")).toBe(true);
    expect(wantsNativeContextMenu(element("<p>text</p>", "p"), "   ")).toBe(false);
  });

  it("claims plain message content", () => {
    expect(wantsNativeContextMenu(element("<p><span>text</span></p>", "span"), "")).toBe(false);
    expect(wantsNativeContextMenu(null, "")).toBe(false);
  });
});
