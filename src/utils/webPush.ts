import { apiClient } from "@/api/client";
import { getServerInfo } from "@/api/serverInfo";
import i18n from "@/i18n";

export function isPushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window
  );
}

function vapidKey(): string {
  return getServerInfo()?.webPushPublicKey ?? "";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const key = vapidKey();
  if (!key) return false;

  const registration = await registerServiceWorker();
  if (!registration) return false;
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  await apiClient.post("/api/me/push-subscriptions", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    locale: i18n.language,
  });
  return true;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  try {
    await subscription.unsubscribe();
  } catch {
    /* ignore */
  }
  try {
    await apiClient.delete(`/api/me/push-subscriptions?endpoint=${encodeURIComponent(endpoint)}`);
  } catch {
    /* ignore */
  }
}
