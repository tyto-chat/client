import type { ConnectionRegistry } from "@/desktop/connections/ConnectionRegistry";
import { identityFetch, unwrapMember } from "@/desktop/connections/identityFetch";
import { resetDmListRevisionForTests } from "@/platform/dmListRevision";
import type { Conversation, HydraCollection } from "@/types/api";

export interface UnifiedConversation {
  identityId: string;
  serverName: string | null;
  conversation: Conversation;
}

export function compareUnified(a: UnifiedConversation, b: UnifiedConversation): number {
  const aUnread = a.conversation.unreadCount > 0 ? 1 : 0;
  const bUnread = b.conversation.unreadCount > 0 ? 1 : 0;
  if (aUnread !== bUnread) return bUnread - aUnread;
  const aTime = a.conversation.lastMessageAt ? new Date(a.conversation.lastMessageAt).getTime() : 0;
  const bTime = b.conversation.lastMessageAt ? new Date(b.conversation.lastMessageAt).getTime() : 0;
  return bTime - aTime;
}

let cachedUnified: UnifiedConversation[] | null = null;

export function getCachedUnifiedConversations(): UnifiedConversation[] | null {
  return cachedUnified;
}

export function __resetUnifiedDmsCacheForTests(): void {
  cachedUnified = null;
  resetDmListRevisionForTests();
}

export async function fetchUnifiedConversations(
  registry: ConnectionRegistry,
): Promise<UnifiedConversation[]> {
  const { connections } = registry.getSnapshot();
  const healthy = connections.filter((c) => c.status === "healthy");
  const lists = await Promise.all(
    healthy.map(async (snapshot) => {
      const connection = registry.getConnection(snapshot.identityId);
      if (!connection) return [];
      try {
        const data = await identityFetch<HydraCollection<Conversation> | Conversation[]>(
          connection.serverContext(),
          "/conversations",
        );
        return unwrapMember(data).map((conversation) => ({
          identityId: snapshot.identityId,
          serverName: snapshot.serverName,
          conversation,
        }));
      } catch {
        return [];
      }
    }),
  );
  cachedUnified = lists.flat().sort(compareUnified);
  return cachedUnified;
}
