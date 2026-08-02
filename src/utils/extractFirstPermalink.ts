export function extractFirstPermalink(html: string): string | null {
  if (!html || html.indexOf("data-internal-link") === -1) return null;
  const div = document.createElement("div");
  div.innerHTML = html;
  const a = div.querySelector<HTMLAnchorElement>("a[data-internal-link]");
  return a?.dataset.internalLink ?? null;
}
