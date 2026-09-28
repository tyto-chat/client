import type { PlatformBridge } from "@/platform/PlatformBridge";
import type { ConnectionRegistry } from "./connections/ConnectionRegistry";
import {
  getServerOrder,
  loadDesktopConfig,
  removeIdentity,
  saveDesktopConfig,
  secretKey,
  setIdentityKind,
  setServerOrder,
  type DesktopIdentity,
} from "./desktopConfig";

export async function revokeAndWipeSecrets(
  bridge: PlatformBridge,
  apiBase: string,
  profileId: string,
  identityId: string,
): Promise<void> {
  const refreshTokenKey = secretKey(profileId, identityId, "refreshToken");
  const passwordKey = secretKey(profileId, identityId, "password");
  try {
    const refreshToken = await bridge.secrets.get(refreshTokenKey);
    if (refreshToken) {
      await fetch(`${apiBase}/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {});
    }
  } catch {
    /* best-effort: the wipe below must still run */
  }
  await bridge.secrets.delete(refreshTokenKey).catch(() => {});
  await bridge.secrets.delete(passwordKey).catch(() => {});
}

function apiBaseFor(registry: ConnectionRegistry, identity: DesktopIdentity): string {
  return registry.getConnection(identity.id)?.serverInfo()?.apiUrl ?? `${identity.serverUrl}/api`;
}

export async function signOutIdentity(
  bridge: PlatformBridge,
  registry: ConnectionRegistry,
  profileId: string,
  identity: DesktopIdentity,
): Promise<void> {
  await revokeAndWipeSecrets(bridge, apiBaseFor(registry, identity), profileId, identity.id);
  const config = await loadDesktopConfig(bridge);
  await saveDesktopConfig(bridge, setIdentityKind(config, profileId, identity.id, "guest"));
  registry.downgradeToGuestSession(identity);
}

export async function removeServer(
  bridge: PlatformBridge,
  registry: ConnectionRegistry,
  profileId: string,
  identity: DesktopIdentity,
): Promise<void> {
  await revokeAndWipeSecrets(bridge, apiBaseFor(registry, identity), profileId, identity.id);
  const config = await loadDesktopConfig(bridge);
  let next = removeIdentity(config, profileId, identity.id);
  const profile = next.profiles.find((p) => p.id === profileId);
  if (profile) {
    const pruned = getServerOrder(profile).filter((id) => id !== identity.id);
    next = setServerOrder(next, profileId, pruned);
  }
  await saveDesktopConfig(bridge, next);
  registry.remove(identity.id);
}
