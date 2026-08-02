import { STORAGE_KEYS } from "@/utils/storageKeys";

export function isDesktopNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getDesktopNotificationsEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEYS.DESKTOP_NOTIFICATIONS) === "true";
}

export function setDesktopNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEYS.DESKTOP_NOTIFICATIONS, enabled ? "true" : "false");
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isDesktopNotificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!isDesktopNotificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

interface DesktopNotificationOptions {
  body: string;
  tag?: string;
  onClick?: () => void;
}

export function showDesktopNotification(title: string, opts: DesktopNotificationOptions): void {
  if (!isDesktopNotificationsSupported()) return;
  if (!getDesktopNotificationsEnabled()) return;
  if (Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;

  try {
    const notification = new Notification(title, {
      body: opts.body,
      tag: opts.tag,
      icon: "/favicon.svg",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
      opts.onClick?.();
    };
  } catch {
    /* ignore */
  }
}
