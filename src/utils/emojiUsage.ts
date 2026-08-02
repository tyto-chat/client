const STORAGE_KEY = "tyto:emoji-usage";
const MAX_TRACKED = 64;

type UsageMap = Record<string, Record<string, number>>;

function readAll(): UsageMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as UsageMap;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeAll(data: UsageMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function recordEmojiUse(communityIdentifier: string, shortcode: string): void {
  if (!communityIdentifier || !shortcode) return;
  const all = readAll();
  const bucket = all[communityIdentifier] ?? {};
  bucket[shortcode] = (bucket[shortcode] ?? 0) + 1;

  const entries = Object.entries(bucket);
  if (entries.length > MAX_TRACKED) {
    entries.sort(([, a], [, b]) => b - a);
    all[communityIdentifier] = Object.fromEntries(entries.slice(0, MAX_TRACKED));
  } else {
    all[communityIdentifier] = bucket;
  }

  writeAll(all);
}

export function getTopEmojiKeys(communityIdentifier: string, limit: number): string[] {
  const all = readAll();
  const bucket = all[communityIdentifier];
  if (!bucket) return [];
  return Object.entries(bucket)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([code]) => code);
}

export function forgetEmojiKeys(communityIdentifier: string, keys: string[]): void {
  if (!communityIdentifier || keys.length === 0) return;
  const all = readAll();
  const bucket = all[communityIdentifier];
  if (!bucket) return;
  let changed = false;
  for (const key of keys) {
    if (key in bucket) {
      delete bucket[key];
      changed = true;
    }
  }
  if (!changed) return;
  all[communityIdentifier] = bucket;
  writeAll(all);
}
