import { describe, it, expect } from "vitest";
import { replaceEmojiShortcodes } from "@/utils/emojiShortcodes";
import type { CommunityEmoji } from "@/types/api";

const fixture: CommunityEmoji[] = [
  {
    "@id": "/api/community_emojis/1",
    "@type": "CommunityEmoji",
    id: 1,
    shortcode: ":thumbs_up:",
    name: null,
    image: {
      "@id": "/api/media_objects/8",
      "@type": "MediaObject",
      contentUrl: "/media/sig/thumbs.png",
      mimeType: "image/png",
      width: 64,
      height: 64,
    },
    position: 0,
    createdAt: "",
    updatedAt: "",
  },
  {
    "@id": "/api/community_emojis/2",
    "@type": "CommunityEmoji",
    id: 2,
    shortcode: ":tyto:",
    name: null,
    image: {
      "@id": "/api/media_objects/9",
      "@type": "MediaObject",
      contentUrl: "/media/sig/tyto.png",
      mimeType: "image/png",
      width: 64,
      height: 64,
    },
    position: 1,
    createdAt: "",
    updatedAt: "",
  },
];

describe("replaceEmojiShortcodes", () => {
  it("replaces a known shortcode with its img tag", () => {
    const out = replaceEmojiShortcodes("<p>hi :thumbs_up:</p>", fixture);
    expect(out).toContain('<img src="/media/sig/thumbs.png"');
    expect(out).toContain('alt=":thumbs_up:"');
  });

  it("replaces custom shortcode with img tag", () => {
    const out = replaceEmojiShortcodes("<p>see :tyto:</p>", fixture);
    expect(out).toContain('<img src="/media/sig/tyto.png"');
    expect(out).toContain('alt=":tyto:"');
  });

  it("leaves unknown shortcodes alone", () => {
    expect(replaceEmojiShortcodes("<p>nope :unknown:</p>", fixture)).toContain(":unknown:");
  });

  it("does not touch shortcodes inside <code>", () => {
    const out = replaceEmojiShortcodes("<p><code>:thumbs_up:</code></p>", fixture);
    expect(out).not.toContain("<img");
    expect(out).toContain(":thumbs_up:");
  });

  it("does not touch shortcodes inside <pre>", () => {
    const out = replaceEmojiShortcodes("<pre>:thumbs_up:</pre>", fixture);
    expect(out).not.toContain("<img");
  });

  it("noop when no emoji list", () => {
    expect(replaceEmojiShortcodes("<p>:thumbs_up:</p>", undefined)).toBe("<p>:thumbs_up:</p>");
  });
});
