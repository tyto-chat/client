import type { CSSProperties } from "react";
import { gradientEnd, onAccentColor } from "@/utils/accentGradient";
import { getUserColor } from "@/utils/userColor";

export function hostFromOrigin(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

export interface TileAccentSource {
  logoUrl: string | null;
  accentColor: string | null;
  iri: string | null;
  identifier: string;
}

export function serverTileStyle(seed: string): CSSProperties {
  const base = getUserColor(seed);
  return {
    backgroundImage: `linear-gradient(135deg, ${base}, ${gradientEnd(base)})`,
    color: onAccentColor(base),
  };
}

export function connectionCommunityTileStyle(community: TileAccentSource): CSSProperties {
  if (community.logoUrl) return {};
  const base = community.accentColor ?? getUserColor(community.iri ?? community.identifier);
  return {
    backgroundImage: `linear-gradient(135deg, ${base}, ${gradientEnd(base)})`,
    color: onAccentColor(base),
  };
}
