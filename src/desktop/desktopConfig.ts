import type { PlatformBridge } from "@/platform/PlatformBridge";

export interface DesktopIdentity {
  id: string;
  serverUrl: string;
  email: string;
  userId: number | null;
  displayName: string | null;
}

export interface DesktopProfile {
  id: string;
  name: string;
  color: string | null;
  identities: DesktopIdentity[];
  lastActiveIdentityId: string | null;
}

export interface DesktopConfig {
  version: 1;
  profiles: DesktopProfile[];
  lastActiveProfileId: string | null;
  autoOpenLastProfile: boolean;
}

export class InvalidServerUrlError extends Error {}
export class DuplicateServerIdentityError extends Error {}

export function normalizeServerUrl(input: string): string {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim())
    ? input.trim()
    : `https://${input.trim()}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new InvalidServerUrlError(input);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new InvalidServerUrlError(input);
  return url.origin;
}

export function createDefaultConfig(): DesktopConfig {
  const profileId = crypto.randomUUID();
  return {
    version: 1,
    profiles: [
      { id: profileId, name: "Default", color: null, identities: [], lastActiveIdentityId: null },
    ],
    lastActiveProfileId: profileId,
    autoOpenLastProfile: true,
  };
}

function mapProfile(
  config: DesktopConfig,
  profileId: string,
  fn: (p: DesktopProfile) => DesktopProfile,
): DesktopConfig {
  return { ...config, profiles: config.profiles.map((p) => (p.id === profileId ? fn(p) : p)) };
}

export function addIdentity(
  config: DesktopConfig,
  profileId: string,
  identity: DesktopIdentity,
): DesktopConfig {
  const origin = normalizeServerUrl(identity.serverUrl);
  return mapProfile(config, profileId, (profile) => {
    if (profile.identities.some((i) => normalizeServerUrl(i.serverUrl) === origin)) {
      throw new DuplicateServerIdentityError(origin);
    }
    return { ...profile, identities: [...profile.identities, { ...identity, serverUrl: origin }] };
  });
}

export function removeIdentity(
  config: DesktopConfig,
  profileId: string,
  identityId: string,
): DesktopConfig {
  return mapProfile(config, profileId, (profile) => ({
    ...profile,
    identities: profile.identities.filter((i) => i.id !== identityId),
    lastActiveIdentityId:
      profile.lastActiveIdentityId === identityId ? null : profile.lastActiveIdentityId,
  }));
}

export function setLastActiveIdentity(
  config: DesktopConfig,
  profileId: string,
  identityId: string,
): DesktopConfig {
  return mapProfile(config, profileId, (profile) => ({
    ...profile,
    lastActiveIdentityId: identityId,
  }));
}

export function secretKey(
  profileId: string,
  identityId: string,
  kind: "password" | "refreshToken",
): string {
  return `${profileId}/${identityId}/${kind}`;
}

export async function loadDesktopConfig(bridge: PlatformBridge): Promise<DesktopConfig> {
  const raw = await bridge.config.get();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DesktopConfig;
      if (parsed.version === 1 && Array.isArray(parsed.profiles)) return parsed;
    } catch {
      void 0;
    }
  }
  const fresh = createDefaultConfig();
  await saveDesktopConfig(bridge, fresh);
  return fresh;
}

export async function saveDesktopConfig(
  bridge: PlatformBridge,
  config: DesktopConfig,
): Promise<void> {
  await bridge.config.set(JSON.stringify(config));
}
