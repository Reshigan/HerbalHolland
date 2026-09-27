/* Herbal Holland Rewards — service worker (registered from Rewards settings with scope "/").
 *
 * Push notifications only: drop alerts and member news the member turned on. There is deliberately no fetch
 * handler, so this worker never touches page loads or caching (the till keeps its own /sw.js, scope /pos).
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Only open pages on this site; anything else falls back to the Rewards card.
const safeUrl = (raw) => {
  try {
    const u = new URL(raw || "/club", self.location.origin);
    return u.origin === self.location.origin ? u.href : new URL("/club", self.location.origin).href;
  } catch {
    return new URL("/club", self.location.origin).href;
  }
};

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Herbal Holland", {
      body: data.body || "",
      icon: "/pwa-icon/192",
      badge: "/club/notification-badge",
      data: { url: safeUrl(data.url) },
    }),
  );
});

// Tabs we may reuse: the storefront and Rewards app — never a till, back-office or menu-board screen.
const STAFF = /^\/(pos|hq|store|menu|login|invoice)(\/|$)/;

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const same = tabs.find((c) => c.url === url);
      if (same) return same.focus();
      const shop = tabs.find((c) => {
        const u = new URL(c.url);
        return u.origin === self.location.origin && !STAFF.test(u.pathname);
      });
      if (shop && "navigate" in shop) {
        try {
          const focused = await shop.focus();
          return await (focused || shop).navigate(url);
        } catch {
          // not controlled by this worker yet: open a new window instead
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
