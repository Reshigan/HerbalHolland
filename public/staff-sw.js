/* Herbal Holland back office — staff service worker (registered from Store → Settings with scope "/store/").
 *
 * Push notifications only: new online orders, loss alerts, HQ updates, expiring lots, cash to bank and the low-stock
 * digest for the stores the person looks after. No fetch handler, so it never touches page loads (the till keeps its
 * own /sw.js at /pos, the Rewards app its /rewards-sw.js at "/").
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Only open pages on this site; anything else falls back to the back office.
const safeUrl = (raw) => {
  try {
    const u = new URL(raw || "/store", self.location.origin);
    return u.origin === self.location.origin ? u.href : new URL("/store", self.location.origin).href;
  } catch {
    return new URL("/store", self.location.origin).href;
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
      tag: data.url || undefined,
      data: { url: safeUrl(data.url) },
    }),
  );
});

// The browser rotated this phone's subscription: subscribe again and tell the server (needs the staff sign-in).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const key = (old && old.options && old.options.applicationServerKey) || (await fetch("/api/staff-push/renew").then((r) => (r.ok ? r.text() : null)));
      if (!key) return;
      const sub = event.newSubscription || (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      await fetch("/api/staff-push/renew", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ old: old ? old.endpoint : null, sub: sub.toJSON() }),
      });
    })().catch(() => {}),
  );
});

// Reuse a back-office tab when there is one; never a till, menu board or the shop.
const STAFF = /^\/(store|hq|account)(\/|$)/;

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const same = tabs.find((c) => c.url === url);
      if (same) return same.focus();
      const office = tabs.find((c) => {
        const u = new URL(c.url);
        return u.origin === self.location.origin && STAFF.test(u.pathname);
      });
      if (office && "navigate" in office) {
        try {
          const focused = await office.focus();
          return await (focused || office).navigate(url);
        } catch {
          // not controlled by this worker: open a new window instead
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
