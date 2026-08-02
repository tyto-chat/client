import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/Avatar";
import { avatarUrl } from "@/api/client";
import { Spinner, ShieldIcon } from "@/components/icons";
import { useCommunityAppeals, useUpdateAppeal } from "@/queries/appealQueries";
import { useNotification } from "@/context/NotificationContext";
import { useTimezone } from "@/context/TimezoneContext";
import { formatMessageTooltip } from "@/utils/dateFormat";
import type { Appeal, AppealStatus } from "@/types/api";

const FILTERS: (AppealStatus | "all")[] = ["pending", "upheld", "overturned", "all"];

const STATUS_COLORS: Record<AppealStatus, string> = {
  pending: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  upheld: "bg-surface text-fg-muted",
  overturned: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

const ACTION_LABEL = {
  warn: "moderation_action_warn",
  timeout: "moderation_action_timeout",
  ban: "moderation_action_ban",
  server_ban: "moderation_action_server_ban",
} as const;

export function AppealsPanel({ communityId }: { communityId: string }) {
  const { t } = useTranslation("appeals");
  const { t: tc } = useTranslation("community");
  const { notify } = useNotification();
  const { timezone } = useTimezone();
  const [status, setStatus] = useState<AppealStatus | "all">("pending");
  const [notes, setNotes] = useState<Record<number, string>>({});

  const { data: appeals = [], isLoading, isFetching } = useCommunityAppeals(communityId, status);
  const updateAppeal = useUpdateAppeal();

  function handleDecision(appeal: Appeal, decision: "upheld" | "overturned") {
    updateAppeal.mutate(
      { id: appeal.id, status: decision, resolutionNote: notes[appeal.id]?.trim() || undefined },
      {
        onSuccess: () =>
          notify(decision === "upheld" ? t("toast.upheld") : t("toast.overturned"), "success"),
        onError: () => notify(t("decide_failed"), "error"),
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 border-b border-line">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatus(f)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              status === f
                ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {t(`filter.${f}`)}
            {status === f && isFetching && (
              <Spinner size={12} className="ml-1.5 inline text-[var(--accent)]" />
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size={28} className="text-[var(--accent)]" />
        </div>
      ) : appeals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-fg-muted">
          <ShieldIcon size={26} className="text-fg-subtle" />
          <p className="text-sm">{t("empty")}</p>
        </div>
      ) : (
        <div className="flex max-h-[60vh] flex-col divide-y divide-line overflow-y-auto">
          {appeals.map((appeal) => (
            <div
              key={appeal.id}
              data-testid="appeal-card"
              className="flex flex-col gap-2 py-3 first:pt-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-surface px-1.5 py-0.5 text-xs font-semibold text-fg-muted">
                  {tc(ACTION_LABEL[appeal.moderationAction.type])}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[appeal.status]}`}
                >
                  {t(`status.${appeal.status}`)}
                </span>
                <span
                  className="ml-auto text-xs text-fg-subtle"
                  title={formatMessageTooltip(appeal.createdAt, timezone)}
                >
                  {new Date(appeal.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <Avatar
                  name={appeal.appellant.profile.name}
                  colorKey={appeal.appellant.profile["@id"]}
                  imageUrl={avatarUrl(appeal.appellant.profile.avatar?.contentUrl ?? null, "sm")}
                  size="xs"
                />
                <span className="font-medium text-fg">{appeal.appellant.profile.name}</span>
              </div>

              {appeal.moderationAction.reason && (
                <p className="text-xs text-fg-subtle">
                  {t("original_reason")}: {appeal.moderationAction.reason}
                </p>
              )}

              <blockquote className="border-l-2 border-line pl-3 text-sm text-fg">
                {appeal.reason}
              </blockquote>

              {appeal.resolutionNote && (
                <p className="text-xs text-fg-subtle">
                  {t("decision_note")}: {appeal.resolutionNote}
                  {appeal.resolvedBy && ` — ${appeal.resolvedBy.profile.name}`}
                </p>
              )}

              {appeal.status === "pending" && (
                <div className="flex flex-col gap-2 rounded-lg bg-surface p-2">
                  <input
                    type="text"
                    value={notes[appeal.id] ?? ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [appeal.id]: e.target.value }))}
                    maxLength={2000}
                    placeholder={t("decision_note_placeholder")}
                    aria-label={t("decision_note_placeholder")}
                    className="w-full rounded-md bg-canvas px-2.5 py-1 text-sm ring-1 ring-inset ring-line"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={updateAppeal.isPending}
                      onClick={() => handleDecision(appeal, "overturned")}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                    >
                      {t("action_overturn")}
                    </button>
                    <button
                      type="button"
                      disabled={updateAppeal.isPending}
                      onClick={() => handleDecision(appeal, "upheld")}
                      className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:bg-canvas disabled:opacity-40"
                    >
                      {t("action_uphold")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
