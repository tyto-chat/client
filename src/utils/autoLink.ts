const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]*/g;
const MAX_DISPLAY_LENGTH = 60;
const MIN_URL_LENGTH = 11;
const PERMALINK_PATH_RE = /^\/m\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function truncateUrl(url: string): string {
  const display = url.replace(/^https?:\/\//, "");
  if (display.length <= MAX_DISPLAY_LENGTH) return display;
  return display.slice(0, MAX_DISPLAY_LENGTH) + "…";
}

function internalPermalinkUuid(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    return PERMALINK_PATH_RE.exec(parsed.pathname)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function processTextNode(node: Text): void {
  const text = node.textContent ?? "";

  URL_REGEX.lastIndex = 0;
  const parts: Array<{ type: "text"; value: string } | { type: "link"; url: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const rawUrl = match[0];
    const url = rawUrl.replace(/[.,!?:;)\]]+$/, "");
    if (url.length < MIN_URL_LENGTH) continue;

    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "link", url });
    const trailing = rawUrl.slice(url.length);
    if (trailing) {
      parts.push({ type: "text", value: trailing });
    }
    lastIndex = match.index + rawUrl.length;
  }

  if (parts.length === 0) return;

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  const fragment = document.createDocumentFragment();
  for (const part of parts) {
    if (part.type === "text") {
      fragment.appendChild(document.createTextNode(part.value));
    } else {
      const a = document.createElement("a");
      a.href = part.url;
      const internalUuid = internalPermalinkUuid(part.url);
      if (internalUuid) {
        a.dataset.internalLink = internalUuid;
      } else {
        a.dataset.externalLink = part.url;
      }
      a.textContent = truncateUrl(part.url);
      fragment.appendChild(a);
    }
  }

  node.parentNode?.replaceChild(fragment, node);
}

export function autoLinkUrls(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent) {
        if (parent.tagName === "A" || parent.tagName === "CODE" || parent.tagName === "PRE") {
          return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    processTextNode(node);
  }

  return div.innerHTML;
}
