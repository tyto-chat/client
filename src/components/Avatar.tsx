import { useState } from "react";
import { PresenceDot } from "@/components/PresenceDot";
import { useUserPresence } from "@/queries/presenceQueries";
import { getUserColor } from "@/utils/userColor";

const sizes = {
  xxs: "h-3.5 w-3.5 text-[0.5rem]",
  xs: "h-5 w-5 text-xs",
  sm: "h-9 w-9 text-sm",
  md: "h-10 w-10 text-sm",
  lg: "h-20 w-20 text-2xl",
} as const;

const dotSizeFor = {
  xxs: "xs",
  xs: "xs",
  sm: "xs",
  md: "xs",
  lg: "sm",
} as const;

interface AvatarProps {
  name: string;
  colorKey: string;
  imageUrl?: string | null;
  size?: keyof typeof sizes;
  className?: string;
  onClick?: () => void;
  userId?: number | null;
}

export function Avatar({
  name,
  colorKey,
  imageUrl,
  size = "md",
  className,
  onClick,
  userId,
}: AvatarProps) {
  const presence = useUserPresence(userId ?? null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!imageUrl && failedUrl !== imageUrl;

  const inner = showImage ? (
    <img
      src={imageUrl}
      alt={name}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover"
      onError={() => setFailedUrl(imageUrl)}
    />
  ) : (
    (name[0]?.toUpperCase() ?? "?")
  );
  const faceClass = `${sizes[size]} block rounded-full overflow-hidden flex items-center justify-center font-bold text-white`;
  const faceStyle = { backgroundColor: showImage ? undefined : getUserColor(colorKey) };

  return (
    <span className={`relative inline-block shrink-0 ${className ?? ""}`} data-testid="avatar">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={name}
          className={`${faceClass} cursor-pointer hover:opacity-80`}
          style={faceStyle}
        >
          {inner}
        </button>
      ) : (
        <span className={faceClass} style={faceStyle}>
          {inner}
        </span>
      )}
      {userId ? (
        <span className="absolute bottom-0 right-0 pointer-events-none">
          <PresenceDot state={presence} size={dotSizeFor[size]} />
        </span>
      ) : null}
    </span>
  );
}
