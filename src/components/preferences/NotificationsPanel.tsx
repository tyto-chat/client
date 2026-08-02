import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateUserPreference } from "@/queries/userPreferencesQueries";
import {
  getDesktopNotificationsEnabled,
  getNotificationPermission,
  isDesktopNotificationsSupported,
  requestNotificationPermission,
  setDesktopNotificationsEnabled,
} from "@/utils/desktopNotifications";
import { subscribeToPush, unsubscribeFromPush } from "@/utils/webPush";
import { setEmailNotifications } from "@/api/users";
import { Switch } from "@/components/ui/Switch";
import { SettingRow } from "@/components/preferences/SettingRow";
import { sectionHeading } from "@/components/preferences/panelStyles";

export function NotificationsPanel() {
  const { t } = useTranslation("settings");

  const desktopSupported = isDesktopNotificationsSupported();
  const [desktopEnabled, setDesktopEnabled] = useState(getDesktopNotificationsEnabled);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    getNotificationPermission,
  );

  const { user, refreshUser } = useAuth();
  const updatePreference = useUpdateUserPreference();
  const [emailEnabled, setEmailEnabled] = useState(user?.emailNotifications ?? false);
  const [emailSaving, setEmailSaving] = useState(false);

  const toggleEmail = async () => {
    const next = !emailEnabled;
    setEmailSaving(true);
    setEmailEnabled(next);
    try {
      const res = await setEmailNotifications(next);
      setEmailEnabled(res.emailNotifications);
      await refreshUser();
    } catch {
      setEmailEnabled(!next);
    } finally {
      setEmailSaving(false);
    }
  };

  const toggleDesktop = async () => {
    if (desktopEnabled) {
      setDesktopEnabled(false);
      setDesktopNotificationsEnabled(false);
      if (user) updatePreference.mutate({ desktopNotifications: false });
      void unsubscribeFromPush();
      return;
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    const granted = result === "granted";
    setDesktopEnabled(granted);
    setDesktopNotificationsEnabled(granted);
    if (user) updatePreference.mutate({ desktopNotifications: granted });
    if (granted) void subscribeToPush();
  };

  if (!desktopSupported && !user) {
    return (
      <p className="py-8 text-center text-sm text-fg-muted">{t("notifications_unavailable")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className={sectionHeading}>{t("notifications")}</h3>
        <div className="flex flex-col gap-2">
          {desktopSupported && (
            <SettingRow
              label={t("desktop_notifications")}
              hint={
                permission === "denied"
                  ? t("desktop_notifications_blocked")
                  : t("desktop_notifications_hint")
              }
            >
              <Switch
                checked={desktopEnabled}
                onChange={() => void toggleDesktop()}
                disabled={permission === "denied" && !desktopEnabled}
                label={t("desktop_notifications")}
              />
            </SettingRow>
          )}
          {user && (
            <SettingRow label={t("email_notifications")} hint={t("email_notifications_hint")}>
              <Switch
                checked={emailEnabled}
                onChange={() => void toggleEmail()}
                disabled={emailSaving}
                label={t("email_notifications")}
              />
            </SettingRow>
          )}
        </div>
      </section>

      <section>
        <h3 className={sectionHeading}>{t("notif_levels_heading")}</h3>
        <div className="flex flex-col gap-2">
          <SettingRow label={t("notif_levels_label")} hint={t("notif_levels_pointer")}>
            <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[0.65625rem] text-accent">
              {t("notif_levels_badge")}
            </span>
          </SettingRow>
        </div>
      </section>
    </div>
  );
}
