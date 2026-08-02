/* tyto.chat service worker — Web Push background notifications.
 * Plain JS (not processed by Vite). Served at /sw.js → scope "/".
 */

self.addEventListener("install", () => {
  // Activate immediately so a freshly registered worker can receive pushes.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "tyto.chat", body: event.data.text() };
  }

  const title = payload.title || "tyto.chat";
  const body = payload.body || "";
  const url = payload.url || "/";
  const tag = payload.tag;

  event.waitUntil(
    (async () => {
      // Suppress when the app is already focused — the in-app toast covers it.
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const focused = windows.some((c) => c.visibilityState === "visible" && c.focused);
      if (focused) return;

      await self.registration.showNotification(title, {
        body,
        tag,
        renotify: Boolean(tag),
        icon: "/favicon.svg",
        data: { url },
      });
    })(),
  );
});

function sameOriginPath(raw) {
  try {
    const dest = new URL(raw || "/", self.location.origin);
    return dest.origin === self.location.origin ? dest.pathname + dest.search + dest.hash : "/";
  } catch {
    return "/";
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = sameOriginPath(event.notification.data && event.notification.data.url);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an existing tab and hand it the target route via postMessage.
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "push-navigate", url });
          return;
        }
      }
      // No open tab — open one at the deep link.
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
