import { ApiError, configureApiClient, getBaseUrl } from "@/api/client";
import { refreshWithToken, setRefreshExecutor } from "@/api/auth";
import { getApiVersion, negotiateApiVersion } from "@/api/apiVersion";
import { fetchServerInfo } from "@/api/serverInfo";
import type { ServerInfo } from "@/types/api";
import type { PlatformBridge } from "@/platform/PlatformBridge";
import { secretKey, type DesktopIdentity } from "./desktopConfig";

export type ConnectOutcome =
  | { status: "connected"; serverInfo: ServerInfo; token: string }
  | { status: "needs-login" }
  | { status: "unreachable"; error: unknown };

export async function connectIdentity(
  bridge: PlatformBridge,
  profileId: string,
  identity: DesktopIdentity,
): Promise<ConnectOutcome> {
  let serverInfo: ServerInfo;
  try {
    serverInfo = await resolveServer(identity.serverUrl);
  } catch (error) {
    return { status: "unreachable", error };
  }
  configureApiClient(serverInfo.apiUrl);

  const key = secretKey(profileId, identity.id, "refreshToken");
  const stored = await bridge.secrets.get(key);
  if (!stored) return { status: "needs-login" };

  try {
    const { token, refreshToken } = await refreshWithToken(getBaseUrl(), stored);
    if (refreshToken) await bridge.secrets.set(key, refreshToken);
    installRefreshExecutor(bridge, key);
    return { status: "connected", serverInfo, token };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { status: "needs-login" };
    return { status: "unreachable", error };
  }
}

export async function resolveServer(origin: string): Promise<ServerInfo> {
  const negotiation = await negotiateApiVersion(origin);
  if (!negotiation.ok) throw new Error(`api version mismatch: ${negotiation.direction}`);
  return fetchServerInfo(`${origin}/api/${getApiVersion()}/server-info`);
}

export function installRefreshExecutor(bridge: PlatformBridge, key: string): void {
  setRefreshExecutor(async () => {
    const current = await bridge.secrets.get(key);
    if (!current) throw new Error("refresh_failed");
    const { token, refreshToken } = await refreshWithToken(getBaseUrl(), current);
    if (refreshToken) await bridge.secrets.set(key, refreshToken);
    return token;
  });
}
