interface EmojibaseEntry {
  unicode: string;
  label: string;
}

type Listener = () => void;

let labels = new Map<string, string>();
let version = 0;
let activeLocale: string | null = null;
const listeners = new Set<Listener>();

function notify() {
  version += 1;
  for (const fn of listeners) fn();
}

type EmojiDataset = "en" | "pl" | "fr" | "de" | "es" | "it" | "pt" | "uk" | "nl";

function pickDataset(locale: string): EmojiDataset {
  const lang = locale.toLowerCase();
  if (lang.startsWith("pl")) return "pl";
  if (lang.startsWith("fr")) return "fr";
  if (lang.startsWith("de")) return "de";
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("it")) return "it";
  if (lang.startsWith("pt")) return "pt";
  if (lang.startsWith("uk")) return "uk";
  if (lang.startsWith("nl")) return "nl";
  return "en";
}

const datasetLoaders: Record<EmojiDataset, () => Promise<{ default: unknown }>> = {
  en: () => import("emojibase-data/en/compact.json"),
  pl: () => import("emojibase-data/pl/compact.json"),
  fr: () => import("emojibase-data/fr/compact.json"),
  de: () => import("emojibase-data/de/compact.json"),
  es: () => import("emojibase-data/es/compact.json"),
  it: () => import("emojibase-data/it/compact.json"),
  pt: () => import("emojibase-data/pt/compact.json"),
  uk: () => import("emojibase-data/uk/compact.json"),
  nl: () => import("emojibase-data/nl/compact.json"),
};

export async function loadEmojiLabels(locale: string): Promise<void> {
  const dataset = pickDataset(locale);
  if (activeLocale === dataset) return;
  activeLocale = dataset;
  const mod = await datasetLoaders[dataset]();
  const entries = mod.default as EmojibaseEntry[];
  const map = new Map<string, string>();
  for (const e of entries) {
    map.set(e.unicode, e.label);
  }
  labels = map;
  notify();
}

export function getEmojiLabel(glyph: string): string | null {
  return labels.get(glyph) ?? null;
}

export function subscribeEmojiLabels(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emojiLabelsVersion(): number {
  return version;
}
