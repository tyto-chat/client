import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@/components/preferences/SettingRow";
import { useNotification } from "@/context/NotificationContext";
import { sendTestNotification, type TestNotificationPopup } from "@/utils/testNotification";

const COUNTDOWN_SECONDS = 3;
const STATUS_VISIBLE_MS = 5000;

type Status =
  | { kind: "idle" }
  | { kind: "counting"; seconds: number }
  | { kind: "sent"; popup: TestNotificationPopup };

const buttonClass =
  "rounded-md border border-line-strong bg-raised px-2 py-1 text-xs font-medium text-fg hover:bg-surface disabled:opacity-60";

export function TestNotificationRow() {
  const { t } = useTranslation("settings");
  const { notify } = useNotification();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function schedule(seconds: number) {
    setStatus({ kind: "counting", seconds });
    timer.current = setTimeout(() => {
      if (seconds > 1) {
        schedule(seconds - 1);
        return;
      }
      const popup = sendTestNotification(
        { title: t("test_notification_title"), body: t("test_notification_body") },
        notify,
      );
      setStatus({ kind: "sent", popup });
      timer.current = setTimeout(() => setStatus({ kind: "idle" }), STATUS_VISIBLE_MS);
    }, 1000);
  }

  function start() {
    if (status.kind === "counting") return;
    if (timer.current) clearTimeout(timer.current);
    schedule(COUNTDOWN_SECONDS);
  }

  const statusText =
    status.kind === "counting"
      ? t("test_notification_countdown", { seconds: status.seconds })
      : status.kind === "sent"
        ? t(`test_notification_sent_${status.popup}`)
        : "";

  return (
    <SettingRow label={t("test_notification")} hint={t("test_notification_hint")}>
      <span className="text-xs text-fg-subtle" data-testid="test-notification-status">
        {statusText}
      </span>
      <button
        type="button"
        aria-label={t("test_notification_send_label")}
        data-testid="test-notification-send"
        disabled={status.kind === "counting"}
        onClick={start}
        className={buttonClass}
      >
        {t("test_notification_send")}
      </button>
    </SettingRow>
  );
}
