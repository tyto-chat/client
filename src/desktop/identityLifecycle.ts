import type { PlatformBridge } from "@/platform/PlatformBridge";
import { secretKey } from "./desktopConfig";

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
