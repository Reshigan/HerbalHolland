/* Herbal Holland till — service worker (registered from /pos with scope "/pos").
 *
 * Keeps the till's shell and static assets available offline so /pos reloads without a
 * connection. Network-first: online the till always runs the latest build; offline it
 * falls back to the last good copy. API calls (/api/*) are never cached here — the app
 * caches its own data (bootstrap, outbox) and knows when it is offline.
 */
const CACHE = "hh-till-v1";
const SHELL = ["/pos", "/pos/manifest.webmanifest", "/pos/app-icon"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE && key.startsWith("hh-till-")) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// The page posts the URLs it loaded (scripts, styles, fonts) so the first visit is cached too.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "CACHE_URLS" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        data.urls
          .filter((u) => typeof u === "string" && cacheable(new URL(u, self.location.origin)))
          .map((u) => fetch(u, { credentials: "same-origin" }).then((res) => (ok(res) ? cache.put(u, res) : undefined)).catch(() => undefined)),
      ),
    ),
  );
});

function ok(res) {
  return res && res.ok && res.type === "basic" && !res.redirected;
}

function cacheable(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.includes("webpack-hmr") || url.pathname.includes("__nextjs") || url.pathname.includes("/_next/turbopack")) return false;
  return url.pathname === "/pos" || url.pathname.startsWith("/pos/") || url.pathname.startsWith("/_next/") || /\.(?:js|css|woff2?|svg|png|ico)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!cacheable(url)) return;
  const navigation = req.mode === "navigate";
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (ok(res)) cache.put(navigation ? url.pathname : req, res.clone()).catch(() => undefined);
        return res;
      } catch (err) {
        const hit =
          (await cache.match(navigation ? url.pathname : req, { ignoreVary: true })) ||
          (navigation ? await cache.match("/pos", { ignoreVary: true }) : undefined);
        if (hit) return hit;
        throw err;
      }
    })(),
  );
});
