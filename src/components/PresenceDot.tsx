import { useTranslation } from "react-i18next";
import type { PresenceState } from "@/types/api";

const sizes = {
  xs: "h-2 w-2 ring-1",
  sm: "h-2.5 w-2.5 ring-2",
  md: "h-3 w-3 ring-2",
  lg: "h-4 w-4 ring-2",
} as const;

const palette: Record<PresenceState, string> = {
  online: "bg-green-500",
  away: "bg-amber-400",
  dnd: "bg-red-500",
  offline: "bg-surface",
};

interface PresenceDotProps {
  state: PresenceState;
  size?: keyof typeof sizes;
  hideOffline?: boolean;
  className?: string;
}

export function PresenceDot({
  state,
  size = "sm",
  hideOffline = true,
  className,
}: PresenceDotProps) {
  const { t } = useTranslation("common");
  if (hideOffline && state === "offline") return null;

  return (
    <span
      data-testid="presence-dot"
      data-state={state}
      role="img"
      className={`block rounded-full ring-white ${sizes[size]} ${palette[state]} ${className ?? ""}`}
      aria-label={t(`presence.${state}`)}
      title={t(`presence.${state}`)}
    />
  );
}
