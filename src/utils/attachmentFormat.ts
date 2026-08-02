export function isImageMime(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith("image/");
}

export function formatFileSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatAudioTime(seconds: number): string {
  if (!isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const THUMB_BASE = "relative h-48 w-64 overflow-hidden rounded-lg";
export const THUMB_CLASS = `${THUMB_BASE} border border-line`;
