import type { CSSProperties } from "react";

export function groupChipStyle(color: string | null | undefined): CSSProperties {
  return color
    ? { backgroundColor: `color-mix(in srgb, ${color} 18%, var(--color-surface))`, color }
    : {};
}
