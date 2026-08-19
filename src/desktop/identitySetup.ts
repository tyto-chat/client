import type { PlatformBridge } from "@/platform/PlatformBridge";
import type { AddIdentityResult } from "./AddIdentityWizard";
import {
  addIdentity,
  normalizeServerUrl,
  saveDesktopConfig,
  secretKey,
  setLastActiveIdentity,
  type DesktopConfig,
  type DesktopIdentity,
} from "./desktopConfig";

export async function persistWizardResult(
  bridge: PlatformBridge,
  config: DesktopConfig,
  profileId: string,
  result: AddIdentityResult,
): Promise<DesktopConfig> {
  const origin = normalizeServerUrl(result.serverUrl);
  const profile = config.profiles.find((p) => p.id === profileId);
  const existing = profile?.identities.find((i) => i.serverUrl === origin);
  const guest = result.guest === true;

  let next = config;
  let identityId: string;
  if (existing) {
    identityId = existing.id;
    const accountChanged = existing.email !== result.email;
    const rewritten: DesktopIdentity = {
      ...existing,
      email: result.email,
      kind: guest ? "guest" : "identity",
      ...(accountChanged
        ? {
            userId: null,
            displayName: null,
            avatarDataUrl: null,
            avatarSource: null,
            avatarColorKey: null,
          }
        : {}),
    };
    next = {
      ...next,
      profiles: next.profiles.map((p) =>
        p.id === profileId
          ? { ...p, identities: p.identities.map((i) => (i.id === identityId ? rewritten : i)) }
          : p,
      ),
    };
  } else {
    identityId = crypto.randomUUID();
    next = addIdentity(next, profileId, {
      id: identityId,
      serverUrl: origin,
      email: result.email,
      userId: null,
      displayName: null,
      kind: guest ? "guest" : "identity",
    });
  }
  next = setLastActiveIdentity(next, profileId, identityId);
  await saveDesktopConfig(bridge, next);

  if (guest) return next;

  await bridge.secrets.set(secretKey(profileId, identityId, "password"), result.password);
  const refreshKey = secretKey(profileId, identityId, "refreshToken");
  if (result.refreshToken) {
    await bridge.secrets.set(refreshKey, result.refreshToken);
  }

  return next;
}
