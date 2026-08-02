import type { CommunityEmoji } from "@/types/api";

const SHORTCODE_RE = /:([a-z0-9_-]{2,32}):/g;

export function replaceEmojiShortcodes(html: string, emojis: CommunityEmoji[] | undefined): string {
  if (!emojis || emojis.length === 0) return html;

  const byShortcode = new Map<string, CommunityEmoji>();
  for (const e of emojis) byShortcode.set(e.shortcode, e);

  const container = document.createElement("div");
  container.innerHTML = html;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (parent && (parent.closest("code") || parent.closest("pre"))) continue;
    textNodes.push(node as Text);
  }

  for (const text of textNodes) {
    const original = text.nodeValue ?? "";
    if (!original.includes(":")) continue;
    SHORTCODE_RE.lastIndex = 0;
    if (!SHORTCODE_RE.test(original)) continue;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    SHORTCODE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SHORTCODE_RE.exec(original))) {
      const shortcode = `:${m[1]}:`;
      const emoji = byShortcode.get(shortcode);
      if (!emoji) continue;
      if (m.index > lastIndex) {
        fragment.appendChild(document.createTextNode(original.slice(lastIndex, m.index)));
      }
      if (emoji.image?.contentUrl) {
        const img = document.createElement("img");
        img.src = emoji.image.contentUrl;
        img.alt = shortcode;
        img.title = shortcode;
        img.loading = "lazy";
        img.decoding = "async";
        img.className = "inline-block h-[1.2em] w-[1.2em] align-middle";
        fragment.appendChild(img);
      } else {
        fragment.appendChild(document.createTextNode(shortcode));
      }
      lastIndex = m.index + shortcode.length;
    }
    if (lastIndex < original.length) {
      fragment.appendChild(document.createTextNode(original.slice(lastIndex)));
    }
    text.replaceWith(fragment);
  }

  return container.innerHTML;
}
