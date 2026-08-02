const STORAGE_KEY = "tyto:last-location";

export type LastLocation =
  | { kind: "channel"; communityId: string; channelId: string }
  | { kind: "dm"; conversationId: string };

export function writeLastLocation(userId: number, location: LastLocation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, ...location }));
  } catch {
    /* storage unavailable */
  }
}

export function readLastLocation(userId: number): LastLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const value = parsed as Record<string, unknown>;
    if (value.userId !== userId) return null;
    if (
      value.kind === "channel" &&
      typeof value.communityId === "string" &&
      typeof value.channelId === "string"
    ) {
      return { kind: "channel", communityId: value.communityId, channelId: value.channelId };
    }
    if (value.kind === "dm" && typeof value.conversationId === "string") {
      return { kind: "dm", conversationId: value.conversationId };
    }
    return null;
  } catch {
    return null;
  }
}

export function takeLastLocation(userId: number): LastLocation | null {
  const location = readLastLocation(userId);
  if (location) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }
  return location;
}
