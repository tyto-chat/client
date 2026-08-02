const GRADIENT_HUE_SHIFT = 38;
export const BRAND_ACCENT = "#22d3ee";
const BRAND_ACCENT_2 = "#a855f7";

export function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function gradientEnd(hex: string): string {
  if (hex.toLowerCase() === BRAND_ACCENT) return BRAND_ACCENT_2;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const [h, s, l] = hexToHsl(hex);
  return `hsl(${(h + GRADIENT_HUE_SHIFT) % 360} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastWithWhite(rgb: [number, number, number]): number {
  return 1.05 / (relativeLuminance(rgb) + 0.05);
}

export function accentStrong(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;

  const [h, s, l] = hexToHsl(hex);
  const hue = Math.round(h);
  const saturation = Math.round(s * 100);

  let lightness = Math.round(l * 100);
  while (
    lightness > 5 &&
    contrastWithWhite(hslToRgb(hue, saturation / 100, lightness / 100)) < 4.5
  ) {
    lightness -= 1;
  }
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

/** RGB of the gradient's visual midpoint — where on-gradient text actually sits. */
export function gradientMidpointRgb(hex: string): [number, number, number] {
  const start = hexToRgb(hex);
  const end =
    hex.toLowerCase() === BRAND_ACCENT
      ? hexToRgb(BRAND_ACCENT_2)
      : (() => {
          const [h, s, l] = hexToHsl(hex);
          return hslToRgb((h + GRADIENT_HUE_SHIFT) % 360, s, l);
        })();
  return [
    Math.round((start[0] + end[0]) / 2),
    Math.round((start[1] + end[1]) / 2),
    Math.round((start[2] + end[2]) / 2),
  ];
}

/**
 * Text colour to sit on an accent gradient.
 *
 * The brand gradient is deliberately white-on-cyan to match the marketing site,
 * even though its midpoint is light enough that the contrast rule would pick
 * black. Community-chosen accents get the computed answer.
 */
export function onAccentColor(hex: string): string {
  if (hex.toLowerCase() === BRAND_ACCENT) return "#ffffff";
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";

  const [r, g, b] = gradientMidpointRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 128 ? "#000000" : "#ffffff";
}
