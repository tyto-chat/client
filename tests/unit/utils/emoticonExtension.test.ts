import { describe, expect, it } from "vitest";
import { matchEmoticon } from "@/utils/emoticonExtension";

describe("matchEmoticon", () => {
  it("converts common emoticons at the start", () => {
    expect(matchEmoticon(":)")).toBe("🙂");
    expect(matchEmoticon("<3")).toBe("❤️");
    expect(matchEmoticon(";)")).toBe("😉");
    expect(matchEmoticon(":-)")).toBe("🙂");
    expect(matchEmoticon("XD")).toBe("😆");
    expect(matchEmoticon(">:(")).toBe("😠");
  });

  it("converts after a word boundary", () => {
    expect(matchEmoticon("hello :)")).toBe("🙂");
    expect(matchEmoticon("nice work <3")).toBe("❤️");
  });

  it("requires a boundary before the emoticon", () => {
    expect(matchEmoticon("x:)")).toBeNull();
    expect(matchEmoticon("foo<3")).toBeNull();
  });

  it("does not fire inside a URL being typed", () => {
    expect(matchEmoticon("http:/")).toBeNull();
    expect(matchEmoticon("https://")).toBeNull();
  });

  it("only matches at the end of the text", () => {
    expect(matchEmoticon(":) done")).toBeNull();
  });

  it("returns null for non-emoticons", () => {
    expect(matchEmoticon("hello")).toBeNull();
    expect(matchEmoticon("")).toBeNull();
  });
});
