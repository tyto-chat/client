import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Avatar } from "@/components/Avatar";
import { ModalTabs } from "@/components/ui";
import { avatarUrl } from "@/api/client";
import { Spinner } from "@/components/icons";
import { useModerationLog, useLiftModerationAction } from "@/queries/moderationQueries";
import { useNotification } from "@/context/NotificationContext";
import { useTimezone } from "@/context/TimezoneContext";
import { formatMessageTooltip } from "@/utils/dateFormat";
import type { ModerationAction } from "@/types/api";

type LogTab = "all" | "bans";

interface Props {
  communityId: string;
  canLift: boolean;
}

const TYPE_COLORS: Record<ModerationAction["type"], string> = {
  warn: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  timeout: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  ban: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  server_ban: "bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200",
};

export function ModerationLogPanel({ communityId, canLift }: Props) {
  const { t } = useTranslation("community");
  const { notify } = useNotification();
  const { timezone } = useTimezone();

  const [tab, setTab] = useState<LogTab>("all");
  const [page, setPage] = useState(1);

  function switchTab(next: LogTab) {
    setTab(next);
    setPage(1);
  }

  const type = tab === "bans" ? ("ban" as const) : undefined;
  const activeOnly = tab === "bans";

  const { data, isLoading, isFetching } = useModerationLog(communityId, page, type, activeOnly);
  const liftAction = useLiftModerationAction(communityId, 0);

  const actions = data?.["hydra:member"] ?? [];
  const total = data?.["hydra:totalItems"] ?? 0;
  const pageSize = 30;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function handleLift(action: ModerationAction) {
    try {
      await liftAction.mutateAsync(action.id);
      notify(t("moderation_lift_success"), "success");
    } catch {
      notify(t("moderation_lift_error"), "error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ModalTabs
        tabs={(["all", "bans"] as LogTab[]).map((tabKey) => ({
          key: tabKey,
          label: t(`moderation_log_tab_${tabKey}`),
        }))}
        active={tab}
        onChange={(key) => switchTab(key as LogTab)}
        testIdPrefix="modlog-tab-"
      />
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size={28} className="text-[var(--accent)]" />
        </div>
      ) : actions.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">{t("moderation_log_empty")}</p>
      ) : (
        <div className="flex flex-col divide-y divide-line max-h-[60vh] overflow-y-auto">
          {actions.map((action) => (
            <ActionRow
              key={action.id}
              action={action}
              timezone={timezone}
              canLift={canLift}
              onLift={handleLift}
              isLifting={liftAction.isPending}
              t={t}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-line pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isFetching}
            className="rounded px-3 py-1.5 text-sm text-fg-muted hover:bg-surface disabled:opacity-40"
          >
            ← {t("moderation_log_prev")}
          </button>
          <span className="text-xs text-fg-subtle">
            {page} / {totalPages}
            {isFetching && <Spinner size={12} className="ml-2 inline text-[var(--accent)]" />}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || isFetching}
            className="rounded px-3 py-1.5 text-sm text-fg-muted hover:bg-surface disabled:opacity-40"
          >
            {t("moderation_log_next")} →
          </button>
        </div>
      )}
    </div>
  );
}

interface ActionRowProps {
  action: ModerationAction;
  timezone: string;
  canLift: boolean;
  onLift: (action: ModerationAction) => void;
  isLifting: boolean;
  t: TFunction<"community">;
}

function ActionRow({ action, timezone, canLift, onLift, isLifting, t }: ActionRowProps) {
  const createdAt = new Date(action.createdAt);

  return (
    <div
      data-testid={`modlog-row-${action.type}`}
      className="flex items-start gap-3 py-3 first:pt-0"
    >
      <Avatar
        name={action.targetUser.profile.name}
        colorKey={action.targetUser.profile["@id"]}
        imageUrl={avatarUrl(action.targetUser.profile.avatar?.contentUrl ?? null, "sm")}
        size="xs"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-fg dark:text-white">
            {action.targetUser.profile.name}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TYPE_COLORS[action.type]}`}
          >
            {t(`moderation_action_${action.type}`)}
          </span>
          {action.active ? (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
              {t("moderation_log_active")}
            </span>
          ) : action.liftedAt ? (
            <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-fg-muted">
              {t("moderation_log_lifted")}
            </span>
          ) : (
            <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-fg-muted">
              {t("moderation_log_expired")}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {action.reason && <span className="text-xs text-fg-muted">"{action.reason}"</span>}
          <span className="text-xs text-fg-subtle">
            {t("moderation_log_by")} {action.actorUser.profile.name}
          </span>
          <span
            className="text-xs text-fg-subtle"
            title={formatMessageTooltip(action.createdAt, timezone)}
          >
            {createdAt.toLocaleDateString()}
          </span>
          {action.expiresAt && (
            <span className="text-xs text-fg-subtle">
              · {t("moderation_active_expires")} {new Date(action.expiresAt).toLocaleDateString()}
            </span>
          )}
          {action.liftedBy && (
            <span className="text-xs text-fg-subtle">
              · {t("moderation_log_lifted_by")} {action.liftedBy.profile.name}
            </span>
          )}
        </div>
      </div>

      {canLift && action.active && (
        <button
          onClick={() => onLift(action)}
          disabled={isLifting}
          className="shrink-0 rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-50 dark:hover:text-white"
        >
          {isLifting ? "…" : t("moderation_lift")}
        </button>
      )}
    </div>
  );
}
