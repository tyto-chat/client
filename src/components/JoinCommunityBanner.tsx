import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { joinCommunity } from "@/api/communities";
import { useNotification } from "@/context/NotificationContext";
import { queryKeys } from "@/queries/queryKeys";
import type { Community } from "@/types/api";

interface JoinCommunityBannerProps {
  community: Community;
  isAdmin?: boolean;
}

export function JoinCommunityBanner({ community, isAdmin = false }: JoinCommunityBannerProps) {
  const { t } = useTranslation("community");
  const queryClient = useQueryClient();
  const { notify } = useNotification();
  const [isJoining, setIsJoining] = useState(false);

  if (community.isPrivate === true && !isAdmin) {
    return (
      <div className="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm max-md:-mx-[18px] max-md:-mb-2 max-md:rounded-none max-md:border-0 dark:border-amber-800/40 dark:bg-amber-900/20">
        <p className="font-medium text-amber-800 dark:text-amber-300">{t("invite_only_title")}</p>
        <p className="mt-0.5 text-amber-700 dark:text-amber-400">{t("invite_only_description")}</p>
      </div>
    );
  }

  async function handleJoin() {
    setIsJoining(true);
    try {
      await joinCommunity(community.identifier);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.communities() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.community(community.identifier) }),
      ]);
      notify(t("joined_community", { name: community.name }), "success");
    } catch {
      notify(t("join_failed"), "error");
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <div className="mx-4 mb-3 flex items-center justify-between gap-4 rounded-lg border border-[var(--accent-light-h)] bg-[var(--accent-light)] px-4 py-3 max-md:-mx-[18px] max-md:-mb-2 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:px-3 max-md:py-2 dark:border-[var(--accent)] dark:bg-[var(--accent-dark)] dark:max-md:bg-transparent">
      <div className="text-sm max-md:hidden">
        <p className="font-medium text-[var(--accent-text-on-light)] dark:text-[var(--accent-text-dark)]">
          {t("browsing_community", { name: community.name })}
        </p>
        <p className="mt-0.5 text-[var(--accent-text-on-light)] dark:text-[var(--accent-text-dark)]">
          {t("join_to_participate")}
        </p>
      </div>
      <button
        type="button"
        onClick={handleJoin}
        disabled={isJoining}
        className="shrink-0 rounded-lg bg-accent-gradient px-4 py-1.5 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50 max-md:w-full"
      >
        {isJoining ? t("joining") : t("join_community")}
      </button>
    </div>
  );
}
