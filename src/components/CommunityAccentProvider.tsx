import { useEffect } from "react";
import type { Community } from "@/types/api";
import {
  accentStrong,
  BRAND_ACCENT,
  gradientEnd,
  hexToHsl,
  onAccentColor,
} from "@/utils/accentGradient";

const ACCENT_DEFAULT = BRAND_ACCENT;

function accentText(hex: string, theme: "light" | "dark"): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const [h, s, l] = hexToHsl(hex);
  const clamped = theme === "light" ? Math.min(l, 0.4) : Math.max(l, 0.7);
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(clamped * 100)}%)`;
}

interface Props {
  community: Community | undefined;
  children: React.ReactNode;
  className?: string;
}

export function CommunityAccentProvider({ community, children, className }: Props) {
  const accent = community?.accentColor ?? ACCENT_DEFAULT;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-2", gradientEnd(accent));
    root.style.setProperty("--accent-on", onAccentColor(accent));
    root.style.setProperty("--accent-strong", accentStrong(accent));
    root.style.setProperty("--accent-text-on-light", accentText(accent, "light"));
    root.style.setProperty("--accent-text-dark", accentText(accent, "dark"));
    return () => {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-2");
      root.style.removeProperty("--accent-on");
      root.style.removeProperty("--accent-strong");
      root.style.removeProperty("--accent-text-on-light");
      root.style.removeProperty("--accent-text-dark");
    };
  }, [accent]);

  return <div className={className}>{children}</div>;
}
