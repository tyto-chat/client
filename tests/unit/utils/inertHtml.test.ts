import { describe, it, expect, vi, afterEach } from "vitest";
import { parseInertHtml } from "@/utils/inertHtml";
import { gateRemoteImages } from "@/utils/remoteContent";
import { autoLinkUrls } from "@/utils/autoLink";
import { highlightTerms } from "@/utils/highlightTerms";

const remoteImage = '<p>hi <img src="https://tracker.example/pixel.png"> https://x.example</p>';
const labels = { load: (h: string) => `load ${h}`, always: (d: string) => `always ${d}` };

afterEach(() => vi.restoreAllMocks());

describe("parseInertHtml", () => {
  it("parses into a document without a window, so images never load", () => {
    const root = parseInertHtml(remoteImage);
    expect(root.ownerDocument).not.toBe(document);
    expect(root.ownerDocument.defaultView).toBeNull();
    expect(root.querySelector("img")?.getAttribute("src")).toBe(
      "https://tracker.example/pixel.png",
    );
  });

  it.each([
    [
      "gateRemoteImages",
      () => gateRemoteImages(remoteImage, labels, { version: 0, canAutoLoad: () => false }),
    ],
    ["autoLinkUrls", () => autoLinkUrls(remoteImage)],
    ["highlightTerms", () => highlightTerms(remoteImage, ["hi"])],
  ])("%s never parses message HTML in the live document", (_name, run) => {
    const spy = vi.spyOn(document, "createElement");
    run();
    expect(spy.mock.calls.filter(([tag]) => tag === "div" || tag === "template")).toEqual([]);
  });
});
