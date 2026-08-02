import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EyeIcon } from "@/components/icons";
import { useAuth } from "@/hooks/useAuth";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useCommunityPresenceSummary } from "@/queries/presenceQueries";
import { CommunityOnlinePanel } from "@/components/CommunityOnlinePanel";

interface CommunityOnlineBadgeProps {
  communityIdentifier: string;
  onUserClick?: (userId: number) => void;
}

export function CommunityOnlineBadge({
  communityIdentifier,
  onUserClick,
}: CommunityOnlineBadgeProps) {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const { data } = useCommunityPresenceSummary(communityIdentifier);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const count = data?.onlineCount ?? 0;
  const guests = data?.guestsOnline ?? 0;
  if (count === 0 && guests === 0) return null;
  const title =
    count === 0 && guests > 0
      ? t("presence.guest_count", { count: guests })
      : guests > 0
        ? `${t("presence.online_count_title", { count })} · ${t("presence.guest_count", { count: guests })}`
        : t("presence.online_count_title", { count });

  if (!user) {
    return (
      <span
        data-testid="community-online-badge"
        title={title}
        aria-label={title}
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium text-fg-muted"
      >
        {count > 0 && (
          <>
            <span className="block h-2 w-2 rounded-full bg-green-500" />
            <span className="block cap-trim">{count}</span>
          </>
        )}
        {guests > 0 && (
          <>
            <EyeIcon size={13} className="shrink-0 text-fg-subtle" />
            <span className="block cap-trim text-fg-subtle">{guests}</span>
          </>
        )}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        data-testid="community-online-badge"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={title}
        aria-label={title}
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium text-fg-muted hover:bg-surface"
      >
        {count > 0 && (
          <>
            <span className="block h-2 w-2 rounded-full bg-green-500" />
            <span className="block cap-trim">{count}</span>
          </>
        )}
        {guests > 0 && (
          <>
            <EyeIcon size={13} className="shrink-0 text-fg-subtle" />
            <span className="block cap-trim text-fg-subtle">{guests}</span>
          </>
        )}
      </button>
      {open && (
        <div className="animate-menu-in absolute right-0 top-full mt-1 z-50">
          <CommunityOnlinePanel
            communityIdentifier={communityIdentifier}
            onUserClick={(userId) => {
              onUserClick?.(userId);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
