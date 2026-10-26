export function isGifUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".gif");
  } catch {
    return false;
  }
}

export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const UNLAID_OUT_STILL_SIDE = 640;

export function stillFrameSize(
  naturalWidth: number,
  naturalHeight: number,
  shownWidth: number,
  shownHeight: number,
  density: number,
): { width: number; height: number } {
  const shown = Math.max(shownWidth / naturalWidth, shownHeight / naturalHeight);
  const target = shown > 0 ? shown : UNLAID_OUT_STILL_SIDE / Math.max(naturalWidth, naturalHeight);
  const scale = Math.min(1, target * density);
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}
