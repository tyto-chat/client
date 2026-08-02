import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "span",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "br",
  "blockquote",
  "img",
];

export function sanitizeMessageHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [
      "class",
      "data-channel-id",
      "data-user-id",
      "data-broadcast",
      "data-internal-link",
      "src",
      "alt",
      "title",
      "loading",
      "decoding",
    ],
  });
}
