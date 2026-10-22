import { decodeJwtPayload } from "@/utils/jwtPayload";

interface MercurePayload {
  mercure?: { subscribe?: unknown };
}

function grantMatches(grant: string, topic: string): boolean {
  if (grant === "*" || grant === topic) return true;
  if (!grant.includes("{")) return false;
  const pattern = grant
    .split(/\{[^}]*\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]+");
  return new RegExp(`^${pattern}$`).test(topic);
}

export function tokenCovers(token: string, topics: string[]): boolean | null {
  const grants = decodeJwtPayload<MercurePayload>(token)?.mercure?.subscribe;
  if (!Array.isArray(grants) || !grants.every((g) => typeof g === "string")) return null;
  return topics.every((topic) => grants.some((grant) => grantMatches(grant, topic)));
}

export function needsReconnect(connectedWith: string, latest: string, topics: string[]): boolean {
  if (connectedWith === latest) return false;
  if (tokenCovers(connectedWith, topics) === true) return false;
  return tokenCovers(latest, topics) !== false;
}
