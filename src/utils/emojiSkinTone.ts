import { SKIN_TONE_COUNT } from "@/utils/emojiCatalog";

export { SKIN_TONE_COUNT };

const STORAGE_KEY = "tyto.emojiSkinTone";
const MODIFIERS = ["", "\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];

export function getSkinTone(): number {
  const raw = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isInteger(raw) && raw >= 0 && raw < SKIN_TONE_COUNT ? raw : 0;
}

export function setSkinTone(tone: number): void {
  localStorage.setItem(STORAGE_KEY, String(tone));
}

export function skinToneGlyph(tone: number): string {
  return `✋${MODIFIERS[tone] ?? ""}`;
}
