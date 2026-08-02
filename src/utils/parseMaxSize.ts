const UNITS: Record<string, number> = { k: 1024, m: 1024 ** 2, g: 1024 ** 3 };

export function parseMaxSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*([kmg])?$/i);
  const [, num, unit] = match ?? [];
  if (!num) return Infinity;
  return parseFloat(num) * (unit ? (UNITS[unit.toLowerCase()] ?? 1) : 1);
}
