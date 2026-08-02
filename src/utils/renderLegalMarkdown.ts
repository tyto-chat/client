import { marked } from "marked";
import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "a",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "hr",
  "br",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

export function renderLegalMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: false });
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "title"],
    ADD_ATTR: ["target", "rel"],
  });
}
