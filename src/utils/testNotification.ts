import { isManagedIdentityMode } from "@/platform/appMode";
import { playNotificationSound } from "@/sounds/sounds";
import {
  getDesktopNotificationsEnabled,
  showDesktopNotification,
} from "@/utils/desktopNotifications";

export type TestNotificationPopup = "shown" | "focused" | "off";

interface TestNotificationText {
  title: string;
  body: string;
}

function windowIsInFront(): boolean {
  if (isManagedIdentityMode()) return document.hasFocus();
  return document.visibilityState === "visible";
}

export function popupOutcome(): TestNotificationPopup {
  if (!getDesktopNotificationsEnabled()) return "off";
  return windowIsInFront() ? "focused" : "shown";
}

export function sendTestNotification(
  text: TestNotificationText,
  notify: (message: string, type: "info") => void,
): TestNotificationPopup {
  const outcome = popupOutcome();
  notify(text.body, "info");
  if (outcome === "shown") {
    showDesktopNotification(text.title, { body: text.body, tag: "test-notification" });
  }
  playNotificationSound({ notificationType: "dm_message", sameServer: true });
  return outcome;
}
