const UUID_RE_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractPermalinkUuids(
  text: string | null | undefined,
  origin: string = window.location.origin,
): string[] {
  if (!text || text.indexOf("/m/") === -1) return [];
  const re = new RegExp(`${escapeForRegex(origin)}/m/(${UUID_RE_SOURCE})`, "gi");
  const uuids = new Set<string>();
  for (const m of text.matchAll(re)) {
    if (m[1]) uuids.add(m[1].toLowerCase());
  }
  return [...uuids];
}
