import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { queryKeys } from "@/queries/queryKeys";
import { useCommunity } from "@/queries/communityQueries";
import { useCommunityMembership } from "@/queries/membershipQueries";
import {
  useCommunityNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@/queries/notificationQueries";
import {
  useIsCommunityMuted,
  useSetCommunityNotificationMuted,
} from "@/queries/notificationPreferenceQueries";
import { joinCommunity } from "@/api/communities";
import { AppealModal } from "@/components/AppealModal";
import { useNotification } from "@/context/NotificationContext";
import { BellIcon, BellOffIcon, CheckDoubleIcon } from "@/components/icons";
import type { AppNotification } from "@/types/api";
import { notificationText } from "@/utils/notificationText";
import { navigationFromNotification } from "@/utils/notificationLink";

interface Props {
  communityIdentifier: string;
}

type TFunc = TFunction<readonly ["notifications", "common"]>;

function renderNotifText(n: AppNotification, t: TFunc): string {
  return notificationText(n, t);
}

function formatRelative(dateStr: string, t: TFunc, now: number): string {
  const diff = now - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("just_now");
  if (m < 60) return t("minutes_ago", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("hours_ago", { count: h });
  return t("days_ago", { count: Math.floor(h / 24) });
}

export function NotificationPanel({ communityIdentifier }: Props) {
  const { t } = useTranslation(["notifications", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: community } = useCommunity(communityIdentifier);
  const { data: membership } = useCommunityMembership(communityIdentifier);
  const communityNumericId = community?.id;
  const hasJoined = membership?.hasMembership ?? false;
  const { notify } = useNotification();

  const isMuted = useIsCommunityMuted(communityNumericId);
  const setMuted = useSetCommunityNotificationMuted();
  const [appealActionId, setAppealActionId] = useState<number | null>(null);

  const join = useMutation({
    mutationFn: () => joinCommunity(communityIdentifier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.community(communityIdentifier) });
      notify(t("joined_for_notifications"), "success");
    },
    onError: () => notify(t("join_failed"), "error"),
  });

  const { data: notifications = [], isLoading } = useCommunityNotifications(communityIdentifier);

  const [renderNow] = useState(() => Date.now());

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAll = useMarkAllNotificationsRead(communityIdentifier, communityNumericId);
  const markOne = useMarkNotificationRead(communityIdentifier, communityNumericId);

  function handleClick(n: AppNotification) {
    if (!n.isRead) {
      markOne.mutate(n.id);
    }
    void navigate(navigationFromNotification(n));
  }

  return (
    <div className="mt-1 overflow-hidden rounded-lg bg-canvas ring-1 ring-inset ring-line shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t("panel_title")}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            title={t("mark_all_read")}
            aria-label={t("mark_all_read")}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--accent)] hover:bg-surface hover:text-[var(--accent-hover)] disabled:opacity-50 dark:text-[var(--accent-muted)]"
          >
            <CheckDoubleIcon size={14} />
          </button>
        )}
      </div>

      {communityNumericId !== undefined && hasJoined && (
        <button
          type="button"
          data-testid="community-mute-toggle"
          onClick={() =>
            setMuted.mutate({
              communityIdentifier,
              communityId: communityNumericId,
              muted: !isMuted,
            })
          }
          disabled={setMuted.isPending}
          className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-xs text-fg-muted hover:bg-surface disabled:opacity-50"
        >
          {isMuted ? <BellOffIcon size={13} className="text-red-500" /> : <BellIcon size={13} />}
          <span className="flex-1 cap-trim">
            {t(isMuted ? "community_muted" : "mute_community")}
          </span>
          <span
            className={`inline-flex h-3.5 w-6 items-center rounded-full px-0.5 transition-colors ${
              isMuted ? "bg-red-500" : "bg-raised"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full bg-canvas transition-transform ${
                isMuted ? "translate-x-2.5" : "translate-x-0"
              }`}
            />
          </span>
        </button>
      )}

      {communityNumericId !== undefined && !hasJoined && (
        <button
          type="button"
          onClick={() => join.mutate()}
          disabled={join.isPending}
          className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-xs text-fg-muted hover:bg-surface disabled:opacity-50"
        >
          <BellIcon size={13} />
          <span className="flex-1">{t("join_for_notifications")}</span>
        </button>
      )}

      {isLoading && (
        <p className="px-3 py-4 text-xs text-center text-fg-subtle">{t("common:loading")}</p>
      )}

      {!isLoading && notifications.length === 0 && (
        <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center text-fg-subtle">
          <BellIcon size={24} className="opacity-40" />
          <p className="text-xs font-medium">{t("no_notifications")}</p>
          <p className="text-[0.6875rem] opacity-80">{t("no_notifications_hint")}</p>
        </div>
      )}

      {!isLoading && notifications.length > 0 && (
        <ul className="max-h-72 overflow-y-auto divide-y divide-line">
          {notifications.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => handleClick(n)}
                className={`w-full text-left px-3 py-2.5 transition-colors hover:bg-surface ${
                  !n.isRead
                    ? "border-l-2 border-[var(--accent)] bg-[var(--accent-light)] dark:bg-[var(--accent-dark)]"
                    : "opacity-60"
                }`}
              >
                <p className="text-xs text-fg">
                  {!n.isRead && <span className="sr-only">{t("unread")} </span>}
                  {renderNotifText(n, t)}
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-fg-subtle">
                  {formatRelative(n.createdAt, t as TFunc, renderNow)}
                </p>
              </button>
              {(n.type === "warn" || n.type === "timeout" || n.type === "ban") &&
                n.moderationActionId != null && (
                  <div className="px-3 pb-2">
                    <button
                      onClick={() => setAppealActionId(n.moderationActionId ?? null)}
                      className="rounded-md border border-line px-2 py-1 text-[0.6875rem] font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg"
                    >
                      {t("appeal_action")}
                    </button>
                  </div>
                )}
            </li>
          ))}
        </ul>
      )}
      {appealActionId != null && (
        <AppealModal actionId={appealActionId} onClose={() => setAppealActionId(null)} />
      )}
    </div>
  );
}
