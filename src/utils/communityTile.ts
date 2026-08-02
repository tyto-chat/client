import type { CSSProperties } from "react";
import type { Community } from "@/types/api";
import { gradientEnd, onAccentColor } from "@/utils/accentGradient";
import { getUserColor } from "@/utils/userColor";

export function communityTileStyle(community: Community): CSSProperties {
  if (community.logo?.contentUrl) return {};

  const base = community.accentColor ?? getUserColor(community["@id"] ?? community.identifier);
  return {
    backgroundImage: `linear-gradient(135deg, ${base}, ${gradientEnd(base)})`,
    color: onAccentColor(base),
  };
}
