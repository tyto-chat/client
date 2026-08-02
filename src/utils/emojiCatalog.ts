import type { EmojiMartData } from "@emoji-mart/data";
import { getEmojiLabel } from "./emojiNameI18n";

export interface UnicodeEmoji {
  id: string;
  glyph: string;
  name: string;
  keywords: string[];
}

export interface CategoryMeta {
  id: string;
  icon: string;
  labelKey: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  people: "😀",
  nature: "🐶",
  foods: "🍔",
  activity: "⚽",
  places: "✈️",
  objects: "💡",
  symbols: "❤️",
  flags: "🏳️",
};

let cataloguePromise: Promise<EmojiMartData> | null = null;
function loadCatalogue(): Promise<EmojiMartData> {
  cataloguePromise ??= import("@emoji-mart/data").then((m) => m.default as EmojiMartData);
  return cataloguePromise;
}

export function warmCatalogue(): void {
  void loadCatalogue();
}

export const SKIN_TONE_COUNT = 6;

function pickGlyph(catalogue: EmojiMartData, emojiId: string, tone = 0): string | null {
  const entry = catalogue.emojis[emojiId];
  if (!entry) return null;
  return entry.skins?.[tone]?.native ?? entry.skins?.[0]?.native ?? null;
}

export async function listCategories(): Promise<CategoryMeta[]> {
  const catalogue = await loadCatalogue();
  return catalogue.categories
    .filter((c) => CATEGORY_ICONS[c.id] !== undefined)
    .map((c) => ({
      id: c.id,
      icon: CATEGORY_ICONS[c.id] ?? "📄",
      labelKey: `emoji_category_${c.id}`,
    }));
}

export async function listEmojisInCategory(categoryId: string, tone = 0): Promise<UnicodeEmoji[]> {
  const catalogue = await loadCatalogue();
  const category = catalogue.categories.find((c) => c.id === categoryId);
  if (!category) return [];
  const out: UnicodeEmoji[] = [];
  for (const id of category.emojis) {
    const glyph = pickGlyph(catalogue, id, tone);
    const entry = catalogue.emojis[id];
    if (!glyph || !entry) continue;
    out.push({ id, glyph, name: entry.name, keywords: entry.keywords });
  }
  return out;
}

export async function searchUnicode(query: string, tone = 0, limit = 200): Promise<UnicodeEmoji[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const catalogue = await loadCatalogue();
  const out: UnicodeEmoji[] = [];
  for (const id of Object.keys(catalogue.emojis)) {
    const entry = catalogue.emojis[id];
    if (!entry) continue;
    const glyph = pickGlyph(catalogue, id, tone);
    if (!glyph) continue;
    const haystack = entry.name.toLowerCase();
    const localised = getEmojiLabel(glyph)?.toLowerCase();
    const keywords = entry.keywords;
    if (
      haystack.includes(q) ||
      (localised !== undefined && localised.includes(q)) ||
      keywords.some((kw) => kw.toLowerCase().includes(q))
    ) {
      out.push({ id, glyph, name: entry.name, keywords });
      if (out.length >= limit) break;
    }
  }
  return out;
}
