import { ApiError, configureApiClient, getBaseUrl } from "@/api/client";
import { refreshWithToken, setRefreshExecutor } from "@/api/auth";
import {
  getApiVersion,
  getApiVersionForOrigin,
  negotiateApiVersion,
  negotiateApiVersionQuiet,
} from "@/api/apiVersion";
import { fetchServerInfo, fetchServerInfoQuiet } from "@/api/serverInfo";
import type { ServerInfo } from "@/types/api";
import type { PlatformBridge } from "@/platform/PlatformBridge";
import { secretKey, type DesktopIdentity } from "./desktopConfig";

export class VersionMismatchError extends Error {
  readonly direction: string;

  constructor(direction: string) {
    super(`api version mismatch: ${direction}`);
    this.name = "VersionMismatchError";
    this.direction = direction;
  }
}

export type ConnectOutcome =
  | { status: "connected"; serverInfo: ServerInfo; token: string }
  | { status: "needs-login" }
  | { status: "unreachable"; error: unknown }
  | { status: "version-mismatch"; direction: string };

export async function connectIdentity(
  bridge: PlatformBridge,
  profileId: string,
  identity: DesktopIdentity,
): Promise<ConnectOutcome> {
  let serverInfo: ServerInfo;
  try {
    serverInfo = await resolveServer(identity.serverUrl);
  } catch (error) {
    if (error instanceof VersionMismatchError) {
      return { status: "version-mismatch", direction: error.direction };
    }
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
  if (!negotiation.ok) throw new VersionMismatchError(negotiation.direction);
  return fetchServerInfo(`${origin}/api/${getApiVersion()}/server-info`);
}

export async function resolveServerQuiet(origin: string): Promise<ServerInfo> {
  const negotiation = await negotiateApiVersionQuiet(origin);
  if (!negotiation.ok) throw new VersionMismatchError(negotiation.direction);
  return fetchServerInfoQuiet(`${origin}/api/${getApiVersionForOrigin(origin)}/server-info`);
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
