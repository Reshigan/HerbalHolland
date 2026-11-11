/* Herbal Holland Rewards — service worker (registered from Rewards settings with scope "/").
 *
 * Push notifications: drop alerts and member news the member turned on. Offline screen: when a shop or Rewards page
 * can't load, it shows /offline.html instead of the browser's error. Only that one static page is cached, never a
 * member's pages, so nothing personal stays on a shared phone. The till keeps its own /sw.js, scope /pos.
 */
const OFFLINE = "/offline.html";
// The suffix is the first 8 hex of sha1(public/offline.html): the page is only re-fetched when this script changes,
// so editing the page must change the name (tests/manifest.test.ts fails with the new value until it does).
const CACHE = "hh-offline-6b6e1709";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(new Request(OFFLINE, { cache: "reload" }))).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hh-offline-") && k !== CACHE).map((k) => caches.delete(k))))
      // Navigation preload starts the page request while the worker boots, so page loads are no slower.
      .then(() => self.registration.navigationPreload && self.registration.navigationPreload.enable())
      .then(() => self.clients.claim()),
  ),
);

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

// The browser rotated this device's subscription (expiry or new keys): subscribe again and tell the server, so drop
// alerts keep arriving. Needs the member to still be signed in on this device; otherwise Rewards settings re-enables.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const key = (old && old.options && old.options.applicationServerKey) || (await fetch("/api/push/renew").then((r) => (r.ok ? r.text() : null)));
      if (!key) return;
      const sub = event.newSubscription || (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      await fetch("/api/push/renew", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ old: old ? old.endpoint : null, sub: sub.toJSON() }),
      });
    })().catch(() => {}),
  );
});

// Tabs we may reuse: the storefront and Rewards app — never a till, back-office or menu-board screen.
const STAFF = /^\/(pos|hq|store|menu|login|invoice|insights)(\/|$)/;

// Page loads only: the network answers as normal. A customer page that fails to load gets the offline screen; staff
// pages keep the browser's own error. Every page load uses the preload, so the browser never discards one.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  const staff = STAFF.test(new URL(req.url).pathname);
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(req));
      } catch (err) {
        if (staff) throw err;
        return (await caches.match(OFFLINE)) || Response.error();
      }
    })(),
  );
});

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
