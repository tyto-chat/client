import { describe, expect, it } from "vitest";
import { extractImageUrls } from "@/utils/images";

describe("extractImageUrls", () => {
  it("collects distinct image URLs in order", () => {
    const text =
      "see https://a.example/x.png and https://a.example/x.png then https://b.example/y.webp?s=1";
    expect(extractImageUrls(text)).toEqual([
      "https://a.example/x.png",
      "https://b.example/y.webp?s=1",
    ]);
  });

  it("ignores URLs that are already rendered as markdown images", () => {
    const text = "![shot](https://a.example/x.png) plus https://b.example/y.jpg";
    expect(extractImageUrls(text)).toEqual(["https://b.example/y.jpg"]);
  });

  it("still embeds a plain markdown link to an image", () => {
    expect(extractImageUrls("[pic](https://a.example/x.png)")).toEqual(["https://a.example/x.png"]);
  });
});
