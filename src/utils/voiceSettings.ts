export type VoiceMode = "open" | "ptt";

export function formatKey(key: string): string {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}
