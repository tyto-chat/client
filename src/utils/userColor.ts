const COLORS: [string, ...string[]] = [
  "#3b82f6",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#db2777",
  "#0d9488",
  "#dc2626",
  "#4f46e5",
  "#0891b2",
  "#d97706",
  "#059669",
  "#7c3aed",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function colorIndex(profileIri: string | null | undefined): number {
  if (!profileIri) return 0;
  return hashString(profileIri) % COLORS.length;
}

/** Avatar/community tile fill. White text is drawn on top of this. */
export function getUserColor(profileIri: string | null | undefined): string {
  return COLORS[colorIndex(profileIri)] ?? COLORS[0];
}

/**
 * The same identity as a TEXT colour. Resolves to a per-theme shade so display
 * names clear WCAG AA on both the light and dark page backgrounds — the fill
 * palette above is too dark on dark and too light on light to use directly.
 */
export function getUserTextColor(profileIri: string | null | undefined): string {
  return `var(--user-text-${colorIndex(profileIri)})`;
}
