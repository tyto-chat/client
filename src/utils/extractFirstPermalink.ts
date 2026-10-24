import type { PermalinkTarget } from "@/utils/linkScope";
import { serverOrigin } from "@/utils/permalinkOrigins";
import { parseInertHtml } from "@/utils/inertHtml";

export function extractFirstPermalink(html: string): PermalinkTarget | null {
  if (!html || html.indexOf("data-internal-link") === -1) return null;
  const div = parseInertHtml(html);
  const a = div.querySelector<HTMLAnchorElement>("a[data-internal-link]");
  const uuid = a?.dataset.internalLink;
  if (!uuid) return null;
  return { origin: a.dataset.internalOrigin ?? serverOrigin(), uuid };
}
