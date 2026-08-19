import type { ConnectionRegistry } from "@/desktop/connections/ConnectionRegistry";
import type {
  ConnectionCommunity,
  ConnectionSnapshot,
} from "@/desktop/connections/IdentityConnection";
import type { ServerContext } from "@/desktop/connections/identityFetch";

export interface ManagerIdentityGroup {
  identityId: string;
  serverName: string | null;
  origin: string;
  healthy: boolean;
  communities: ConnectionCommunity[];
  ctx: ServerContext | null;
}

export function orderConnections(
  connections: ConnectionSnapshot[],
  order: string[],
): ConnectionSnapshot[] {
  const indexOf = new Map(order.map((id, index) => [id, index]));
  return [...connections].sort((a, b) => {
    const indexA = indexOf.get(a.identityId);
    const indexB = indexOf.get(b.identityId);
    if (indexA === undefined && indexB === undefined) return 0;
    if (indexA === undefined) return 1;
    if (indexB === undefined) return -1;
    return indexA - indexB;
  });
}

export function buildManagerGroups(
  registry: ConnectionRegistry,
  order?: string[],
): ManagerIdentityGroup[] {
  const { connections } = registry.getSnapshot();
  const ordered = order ? orderConnections(connections, order) : connections;
  return ordered.map((snapshot) => {
    const healthy = snapshot.status === "healthy";
    const connection = healthy ? registry.getConnection(snapshot.identityId) : undefined;
    return {
      identityId: snapshot.identityId,
      serverName: snapshot.serverName,
      origin: snapshot.origin,
      healthy,
      communities: snapshot.communities,
      ctx: connection ? connection.serverContext() : null,
    };
  });
}

export async function refreshIdentityData(
  registry: ConnectionRegistry,
  identityId: string,
): Promise<void> {
  const connection = registry.getConnection(identityId);
  if (!connection) return;
  await connection.refreshData();
}
