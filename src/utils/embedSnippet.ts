const MAX_FALLBACK = 280;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildEmbedSnippet(opts: {
  origin: string;
  uuid: string;
  fallbackText: string;
  authorName: string;
  channelLabel: string;
}): string {
  if (!UUID_PATTERN.test(opts.uuid)) {
    throw new Error(`buildEmbedSnippet: invalid message uuid "${opts.uuid}"`);
  }
  const origin = escapeHtml(opts.origin);
  const uuid = escapeHtml(opts.uuid);
  const text =
    opts.fallbackText.length > MAX_FALLBACK
      ? `${opts.fallbackText.slice(0, MAX_FALLBACK)}…`
      : opts.fallbackText;
  return [
    `<blockquote class="tyto-embed" data-tyto-message="${uuid}">`,
    `  <p>${escapeHtml(text)}</p>`,
    `  &mdash; ${escapeHtml(opts.authorName)} ${escapeHtml(opts.channelLabel)}`,
    `  <a href="${origin}/m/${uuid}">View message</a>`,
    `</blockquote>`,
    `<script async src="${origin}/embed.js"></script>`,
  ].join("\n");
}

export function stripToPlaintext(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}
