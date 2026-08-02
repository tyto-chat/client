import TurndownService from "turndown";
import { marked } from "marked";

const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

td.addRule("userMention", {
  filter(node) {
    return node.nodeName === "SPAN" && (node as HTMLElement).classList.contains("mention-user");
  },
  replacement(_content, node) {
    const el = node as HTMLElement;
    const id = el.dataset.userId ?? "";
    const name = el.textContent?.replace(/^@/, "") ?? "";
    return `[@${name}](user:${id})`;
  },
});

td.addRule("broadcastMention", {
  filter(node) {
    return (
      node.nodeName === "SPAN" && (node as HTMLElement).classList.contains("mention-broadcast")
    );
  },
  replacement(_content, node) {
    const scope = (node as HTMLElement).dataset.broadcast ?? "";
    return `[@${scope}](broadcast:${scope})`;
  },
});

td.addRule("channelMention", {
  filter(node) {
    return node.nodeName === "SPAN" && (node as HTMLElement).classList.contains("mention-channel");
  },
  replacement(_content, node) {
    const el = node as HTMLElement;
    const id = el.dataset.channelId ?? "";
    const name = el.textContent?.replace(/^#/, "") ?? "";
    return `[#${name}](channel:${id})`;
  },
});

td.addRule("strikethrough", {
  filter: ["s", "del"],
  replacement: (content) => `~~${content}~~`,
});

td.addRule("underline", {
  filter: ["u"],
  replacement: (content) => content,
});

export function htmlToMarkdown(html: string): string {
  return td.turndown(html);
}

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false });
}
