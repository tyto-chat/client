import type { CSSProperties } from "react";
import { gradientEnd, onAccentColor } from "@/utils/accentGradient";
import { getUserColor } from "@/utils/userColor";

interface ServerTileProps {
  name: string;
  colorSeed: string;
  sizeClassName?: string;
  testId?: string;
}

export function ServerTile({
  name,
  colorSeed,
  sizeClassName = "h-[26px] w-[26px]",
  testId,
}: ServerTileProps) {
  const base = getUserColor(colorSeed);
  const style: CSSProperties = {
    backgroundImage: `linear-gradient(135deg, ${base}, ${gradientEnd(base)})`,
    color: onAccentColor(base),
  };
  return (
    <span
      style={style}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] text-xs font-bold ${sizeClassName}`}
    >
      <span className="block cap-trim" data-testid={testId}>
        {name.charAt(0).toUpperCase()}
      </span>
    </span>
  );
}
