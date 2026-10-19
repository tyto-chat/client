import { getServerDirectory } from "@/platform/serverDirectory";
import type { PermalinkTarget } from "@/utils/linkScope";
import { permalinkOrigins } from "@/utils/permalinkOrigins";

const UUID_RE_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractPermalinkTargets(
  text: string | null | undefined,
  origins: string[] = [...permalinkOrigins(), ...getServerDirectory().origins()],
): PermalinkTarget[] {
  if (!text || text.indexOf("/m/") === -1 || origins.length === 0) return [];
  const alternation = origins.map(escapeForRegex).join("|");
  const re = new RegExp(`(${alternation})/m/(${UUID_RE_SOURCE})`, "gi");
  const seen = new Set<string>();
  const targets: PermalinkTarget[] = [];
  for (const m of text.matchAll(re)) {
    const origin = m[1] ? new URL(m[1]).origin : null;
    const uuid = m[2]?.toLowerCase();
    if (!origin || !uuid || seen.has(`${origin}|${uuid}`)) continue;
    seen.add(`${origin}|${uuid}`);
    targets.push({ origin, uuid });
  }
  return targets;
}
