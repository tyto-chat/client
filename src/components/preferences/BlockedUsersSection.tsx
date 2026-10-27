import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/Avatar";
import { sectionHeading } from "@/components/preferences/panelStyles";
import { useNotification } from "@/context/NotificationContext";
import { useBlockedUsers, useUnblockUser } from "@/queries/blockQueries";
import { formatShortDate } from "@/utils/dateFormat";

export function BlockedUsersSection() {
  const { t } = useTranslation("settings");
  const { t: tCommunity } = useTranslation("community");
  const { notify } = useNotification();
  const { data: blocked = [], isLoading, isError } = useBlockedUsers();
  const { t: tCommon } = useTranslation("common");
  const unblock = useUnblockUser();

  function handleUnblock(userId: number, name: string) {
    unblock.mutate(userId, {
      onSuccess: () => notify(tCommunity("unblock_success", { name }), "success"),
      onError: () => notify(tCommunity("block_failed"), "error"),
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className={sectionHeading}>{t("blocked_users_heading")}</h3>
      {isError && <p className="text-sm text-danger">{tCommon("recovery_generic")}</p>}
      {!isLoading && !isError && blocked.length === 0 && (
        <p className="text-sm text-fg-muted">{t("blocked_users_empty")}</p>
      )}
      <ul className="flex flex-col gap-1">
        {blocked.map((b) => {
          const name = b.name ?? "";
          return (
            <li
              key={b.userId}
              data-testid="blocked-user-row"
              className="flex items-center gap-3 rounded-lg px-2 py-1.5"
            >
              <Avatar name={name} colorKey={String(b.userId)} imageUrl={b.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{name}</p>
                <p className="text-xs text-fg-muted">
                  {t("blocked_users_since", { date: formatShortDate(b.blockedAt) })}
                </p>
                {!b.inEffect && (
                  <p className="text-xs text-fg-subtle">{t("blocked_users_not_in_effect")}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleUnblock(b.userId, name)}
                disabled={unblock.isPending && unblock.variables === b.userId}
                aria-label={`${t("blocked_users_unblock")} ${name}`}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-50"
              >
                {t("blocked_users_unblock")}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
