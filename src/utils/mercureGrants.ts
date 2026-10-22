import { decodeJwtPayload } from "@/utils/jwtPayload";

interface MercurePayload {
  mercure?: { subscribe?: unknown };
}

function isTemplateSegment(segment: string): boolean {
  return segment.length > 2 && segment.startsWith("{") && segment.endsWith("}");
}

function grantMatches(grant: string, topic: string): boolean {
  if (grant === "*" || grant === topic) return true;
  const grantSegments = grant.split("/");
  const topicSegments = topic.split("/");
  if (grantSegments.length !== topicSegments.length) return false;
  return grantSegments.every((segment, i) => {
    const value = topicSegments[i] ?? "";
    return isTemplateSegment(segment) ? value !== "" : segment === value;
  });
}

function topicCoverage(token: string, topics: string[]): boolean[] | null {
  const grants = decodeJwtPayload<MercurePayload>(token)?.mercure?.subscribe;
  if (!Array.isArray(grants) || !grants.every((g) => typeof g === "string")) return null;
  return topics.map((topic) => grants.some((grant) => grantMatches(grant, topic)));
}

export function tokenCovers(token: string, topics: string[]): boolean | null {
  return topicCoverage(token, topics)?.every(Boolean) ?? null;
}

export function needsReconnect(connectedWith: string, latest: string, topics: string[]): boolean {
  if (connectedWith === latest) return false;
  const before = topicCoverage(connectedWith, topics);
  const after = topicCoverage(latest, topics);
  if (before === null || after === null) return true;
  return before.some((covered, i) => covered !== after[i]);
}
