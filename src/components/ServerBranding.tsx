import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Modal } from "@/components/Modal";
import { SearchIcon } from "@/components/icons";
import { logoUrl } from "@/api/client";
import { communityTileStyle } from "@/utils/communityTile";
import type { Community, PublicCommunityStats, ServerInfo } from "@/types/api";

interface Props {
  serverInfo: ServerInfo;
  onRegister?: () => void;
  onNavigate?: () => void;
}

export function ServerBranding({ serverInfo, onRegister, onNavigate }: Props) {
  const { t } = useTranslation("auth");
  const [showCommunities, setShowCommunities] = useState(false);

  const publicCommunities = serverInfo.communities.filter((c) => !c.isPrivate);

  return (
    <>
      <div className="mb-2 space-y-1">
        <p className="w-fit text-xl font-bold text-accent-gradient">{serverInfo.name}</p>
        {serverInfo.description && (
          <p className="text-sm text-fg-muted">{serverInfo.description}</p>
        )}
        {publicCommunities.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCommunities(true)}
            className="text-xs text-[var(--accent)] hover:underline dark:text-[var(--accent-muted)]"
          >
            {t("browse_communities", { count: publicCommunities.length })}
          </button>
        )}
      </div>
      {showCommunities && (
        <CommunitiesModal
          communities={publicCommunities}
          stats={serverInfo.communityStats}
          onRegister={serverInfo.registrationEnabled ? onRegister : undefined}
          onNavigate={onNavigate}
          onClose={() => setShowCommunities(false)}
        />
      )}
    </>
  );
}

function CommunitiesModal({
  communities,
  stats,
  onRegister,
  onNavigate,
  onClose,
}: {
  communities: Community[];
  stats?: Record<string, PublicCommunityStats>;
  onRegister?: () => void;
  onNavigate?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["auth", "community"]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return communities;
    return communities.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        (c.description ?? "").toLowerCase().includes(needle),
    );
  }, [communities, query]);

  return (
    <Modal title={t("communities_title")} size="lg" onClose={onClose}>
      {() => (
        <div className="flex max-h-[70vh] flex-col gap-3.5">
          <p className="-mt-2 text-sm text-fg-muted">{t("communities_subtitle")}</p>

          {communities.length >= 6 && (
            <div className="relative">
              <SearchIcon
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("communities_filter")}
                className="w-full rounded-lg bg-surface py-2 pl-9 pr-3 text-sm text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
              />
            </div>
          )}

          <ul className="space-y-2 overflow-y-auto pr-1">
            {filtered.map((c) => {
              const s = stats?.[c.identifier];
              return (
                <li
                  key={c.identifier}
                  className="flex items-center gap-3 rounded-xl border border-line bg-raised p-3 transition-colors hover:border-[var(--accent)]/45"
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg font-bold"
                    style={communityTileStyle(c)}
                  >
                    {c.logo?.contentUrl ? (
                      <img
                        src={logoUrl(c.logo.contentUrl) ?? undefined}
                        alt={c.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="block cap-trim">{c.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-fg dark:text-white">{c.name}</p>
                    {c.description && (
                      <p className="truncate text-xs text-fg-muted">{c.description}</p>
                    )}
                    {s && (
                      <p className="mt-0.5 flex flex-wrap gap-x-2.5 text-[11px] text-fg-subtle">
                        <span>{t("community:group_members_count", { count: s.memberCount })}</span>
                        {s.onlineCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden />
                            {t("stats_online", { count: s.onlineCount })}
                          </span>
                        )}
                        <span>
                          {t("community:group_channels_count", { count: s.channelCount })}
                        </span>
                      </p>
                    )}
                  </div>
                  <Link
                    to="/$communityId"
                    params={{ communityId: c.identifier }}
                    onClick={() => {
                      onClose();
                      onNavigate?.();
                    }}
                    className="flex-none whitespace-nowrap rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface hover:text-fg"
                  >
                    {t("browse_as_guest")}
                  </Link>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="py-6 text-center text-sm text-fg-subtle">
                {t("communities_filter_empty")}
              </li>
            )}
          </ul>

          {onRegister && (
            <div className="flex items-center justify-between gap-3 border-t border-line pt-3.5">
              <p className="text-xs text-fg-muted">{t("register_prompt")}</p>
              <button
                type="button"
                onClick={onRegister}
                className="flex-none rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
              >
                {t("register_link")}
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
