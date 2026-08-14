import { configureApiClient } from "@/api/client";
import { negotiateApiVersion } from "@/api/apiVersion";
import { setServerInfo } from "@/api/serverInfo";
import { setAccessToken } from "@/api/tokenStore";
import type { ServerInfo } from "@/types/api";
import type { PlatformBridge } from "@/platform/PlatformBridge";
import type { AgentRegistry } from "./agents/AgentRegistry";
import { loadDesktopConfig, saveDesktopConfig, setLastActiveIdentity } from "./desktopConfig";

export interface SwitchTarget {
  identityId: string;
  navigateTo?: { to: string; params?: Record<string, string>; search?: Record<string, unknown> };
}

export async function performIdentitySwitch(
  registry: AgentRegistry,
  bridge: PlatformBridge,
  target: SwitchTarget,
): Promise<{ token: string; serverInfo: ServerInfo }> {
  const agent = registry.getAgent(target.identityId);
  const agentSnapshot = agent?.getSnapshot();
  if (!agent || agentSnapshot?.status !== "healthy") {
    throw new Error("identity_switch_target_not_healthy");
  }

  const token = agent.getAccessToken() ?? (await agent.refreshNow());

  await negotiateApiVersion(agentSnapshot.origin);

  const serverInfo = agent.serverInfo();
  if (!serverInfo) throw new Error("identity_switch_missing_server_info");
  configureApiClient(serverInfo.apiUrl);
  setServerInfo(serverInfo);

  setAccessToken(token);
  registry.setActiveIdentity(target.identityId);

  const config = await loadDesktopConfig(bridge);
  const profileId = config.lastActiveProfileId ?? config.profiles[0]?.id ?? null;
  if (profileId) {
    const next = setLastActiveIdentity(config, profileId, target.identityId);
    await saveDesktopConfig(bridge, next);
  }

  return { token, serverInfo };
}
