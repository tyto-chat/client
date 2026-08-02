import { describe, it, expect } from "vitest";
import { extractYouTubeIds } from "@/utils/youtube";

describe("extractYouTubeIds", () => {
  it("extracts a youtu.be id", () => {
    expect(extractYouTubeIds("look https://youtu.be/abcdefghijk here")).toEqual(["abcdefghijk"]);
  });

  it("decodes HTML entities before matching (list=…&amp;v=…)", () => {
    expect(extractYouTubeIds("https://www.youtube.com/watch?list=PL1&amp;v=abcdefghijk")).toEqual([
      "abcdefghijk",
    ]);
  });

  it("dedupes repeated ids and matches shorts", () => {
    expect(
      extractYouTubeIds("https://youtu.be/abcdefghijk https://www.youtube.com/shorts/abcdefghijk"),
    ).toEqual(["abcdefghijk"]);
  });

  it("parses raw untrusted markup inertly — strips tags to text, no id, no throw", () => {
    // Runs on pre-sanitize text; must not instantiate a live <img> (which would
    // fire onerror). DOMParser is inert, so this yields plain text with no ids.
    expect(extractYouTubeIds('<img src=x onerror="alert(1)">')).toEqual([]);
  });

  it("returns [] for text without a youtube link", () => {
    expect(extractYouTubeIds("just some words")).toEqual([]);
  });
});
