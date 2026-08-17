import { configureApiClient } from "@/api/client";
import { negotiateApiVersion } from "@/api/apiVersion";
import { setServerInfo } from "@/api/serverInfo";
import { setAccessToken } from "@/api/tokenStore";
import { setActiveIdentityKey } from "@/platform/activeIdentity";
import type { ServerInfo } from "@/types/api";
import type { PlatformBridge } from "@/platform/PlatformBridge";
import type { ConnectionRegistry } from "./connections/ConnectionRegistry";
import { loadDesktopConfig, saveDesktopConfig, setLastActiveIdentity } from "./desktopConfig";

export interface SwitchTarget {
  identityId: string;
  navigateTo?: { to: string; params?: Record<string, string>; search?: Record<string, unknown> };
}

export async function performIdentitySwitch(
  registry: ConnectionRegistry,
  bridge: PlatformBridge,
  target: SwitchTarget,
): Promise<{ token: string; serverInfo: ServerInfo }> {
  const previousActiveIdentityId = registry.getSnapshot().activeIdentityId;
  const connection = registry.getConnection(target.identityId);
  const connectionSnapshot = connection?.getSnapshot();
  if (!connection || connectionSnapshot?.status !== "healthy") {
    throw new Error("identity_switch_target_not_healthy");
  }

  const token = connection.getAccessToken() ?? (await connection.refreshNow());

  await negotiateApiVersion(connectionSnapshot.origin);

  const serverInfo = connection.serverInfo();
  if (!serverInfo) throw new Error("identity_switch_missing_server_info");
  configureApiClient(serverInfo.apiUrl);
  setServerInfo(serverInfo);

  setAccessToken(token);
  registry.setActiveIdentity(target.identityId);
  setActiveIdentityKey(target.identityId);

  const config = await loadDesktopConfig(bridge);
  const profileId = config.lastActiveProfileId ?? config.profiles[0]?.id ?? null;
  if (profileId) {
    const next = setLastActiveIdentity(config, profileId, target.identityId);
    await saveDesktopConfig(bridge, next);
  }

  const unreadRefreshes = [connection.refreshUnreadCounts()];
  if (previousActiveIdentityId && previousActiveIdentityId !== target.identityId) {
    const previousConnection = registry.getConnection(previousActiveIdentityId);
    if (previousConnection) unreadRefreshes.push(previousConnection.refreshUnreadCounts());
  }
  await Promise.allSettled(unreadRefreshes);

  return { token, serverInfo };
}
