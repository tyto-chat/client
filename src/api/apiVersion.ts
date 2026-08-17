export const SUPPORTED_API_VERSIONS = ["v1"] as const;

export type Negotiation =
  | { ok: true; version: string; features: Record<string, string[]> }
  | { ok: false; direction: "server-older" | "server-newer" };

interface VersionsPayload {
  versions: string[];
  features: Record<string, string[]>;
}

const byOrigin = new Map<string, Negotiation>();
let activeOrigin: string | null = null;

const versionNumber = (v: string) => Number.parseInt(v.slice(1), 10);
const highestSupported = [...SUPPORTED_API_VERSIONS]
  .sort((a, b) => versionNumber(a) - versionNumber(b))
  .at(-1)!;

export async function negotiateApiVersion(origin: string): Promise<Negotiation> {
  const response = await fetch(`${origin}/api/versions`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`versions endpoint returned ${response.status}`);
  const payload = (await response.json()) as VersionsPayload;

  if (
    !Array.isArray(payload.versions) ||
    payload.versions.length === 0 ||
    !payload.versions.every((v) => typeof v === "string" && /^v\d+$/.test(v))
  ) {
    throw new Error("malformed versions payload");
  }

  const common = payload.versions.filter((v) =>
    (SUPPORTED_API_VERSIONS as readonly string[]).includes(v),
  );
  let result: Negotiation;
  if (common.length > 0) {
    const version = common.sort((a, b) => versionNumber(a) - versionNumber(b)).at(-1)!;
    result = { ok: true, version, features: payload.features ?? {} };
  } else {
    const serverMax = Math.max(...payload.versions.map(versionNumber));
    result = {
      ok: false,
      direction: serverMax > versionNumber(highestSupported) ? "server-newer" : "server-older",
    };
  }
  byOrigin.set(origin, result);
  activeOrigin = origin;
  return result;
}

function active(): Negotiation | null {
  return activeOrigin ? (byOrigin.get(activeOrigin) ?? null) : null;
}

export function getApiVersion(): string {
  const negotiation = active();
  return negotiation?.ok ? negotiation.version : highestSupported;
}

export function getApiVersionForOrigin(origin: string): string {
  const negotiation = byOrigin.get(origin) ?? null;
  return negotiation?.ok ? negotiation.version : highestSupported;
}

export function supportsFeature(name: string): boolean {
  const negotiation = active();
  if (!negotiation?.ok) return true;
  return (negotiation.features[name] ?? []).includes(negotiation.version);
}

export function _resetNegotiationForTests(): void {
  byOrigin.clear();
  activeOrigin = null;
}
