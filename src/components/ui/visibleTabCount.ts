const GAP = 6;
const MORE_W = 96;

export function visibleTabCount(available: number, widths: number[], minimum: number): number {
  const total = widths.reduce((sum, w, i) => sum + w + (i > 0 ? GAP : 0), 0);
  if (total <= available) return widths.length;
  let used = 0;
  let count = 0;
  for (let i = 0; i < widths.length; i++) {
    const w = (widths[i] ?? 0) + (i > 0 ? GAP : 0);
    if (used + w + GAP + MORE_W > available) break;
    used += w;
    count++;
  }
  return Math.max(minimum, count);
}
