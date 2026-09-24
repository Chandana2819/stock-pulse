// BullHawk Service Worker — handles web push notifications
const CACHE_VERSION = "bullhawk-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "BullHawk Alert", body: event.data.text() };
  }

  const title = payload.title || "BullHawk";
  const options = {
    body: payload.body || "",
    icon: "/brand/logo-mark.png",
    badge: "/brand/logo-mark.png",
    tag: payload.tag || "bullhawk-" + Date.now(),
    data: { url: payload.link || "/" },
    requireInteraction: payload.priority === "CRITICAL" || payload.priority === "HIGH",
    vibrate: payload.priority === "CRITICAL" ? [200, 100, 200, 100, 200] : [200, 100, 200],
    actions:
      payload.actions ||
      (payload.link
        ? [{ action: "open", title: "View" }]
        : []),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = (event.notification.data && event.notification.data.url) || "/";

  if (event.action === "dismiss") return;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If a BullHawk tab is already open, focus it and navigate
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            client.navigate(urlToOpen);
            return;
          }
        }
        // Otherwise open a new tab
        return clients.openWindow(urlToOpen);
      })
  );
});
