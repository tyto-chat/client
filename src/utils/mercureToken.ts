import { decodeJwtPayload } from "@/utils/jwtPayload";

export function mercureTokenCoversTopic(token: string, topic: string): boolean {
  const payload = decodeJwtPayload<{ mercure?: { subscribe?: string[] } }>(token);
  return payload?.mercure?.subscribe?.includes(topic) ?? false;
}
