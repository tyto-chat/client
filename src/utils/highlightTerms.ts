function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function highlightTerms(html: string, terms: readonly string[]): string {
  if (!html) return html;
  const cleanTerms = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 2))];
  if (cleanTerms.length === 0) return html;

  const div = document.createElement("div");
  div.innerHTML = html;

  cleanTerms.sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${cleanTerms.map(escapeForRegex).join("|")})`, "gi");

  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent) {
        const tag = parent.tagName;
        if (tag === "CODE" || tag === "PRE" || tag === "A" || tag === "MARK") {
          return NodeFilter.FILTER_REJECT;
        }
        if (tag === "SPAN") {
          const cls = parent.className ?? "";
          if (cls.includes("mention-")) return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const text = node.textContent ?? "";
    if (!pattern.test(text)) continue;
    pattern.lastIndex = 0;
    const replaced = escapeHtml(text).replace(pattern, "<mark>$1</mark>");
    const tmp = document.createElement("span");
    tmp.innerHTML = replaced;
    const frag = document.createDocumentFragment();
    while (tmp.firstChild) frag.appendChild(tmp.firstChild);
    node.parentNode?.replaceChild(frag, node);
  }

  return div.innerHTML;
}

export function extractMarkedTerms(snippet: string | null | undefined): string[] {
  if (!snippet) return [];
  const out = new Set<string>();
  for (const m of snippet.matchAll(/<mark>([^<]+)<\/mark>/gi)) {
    const term = m[1]?.trim() ?? "";
    if (term.length >= 2) out.add(term);
  }
  return [...out];
}
