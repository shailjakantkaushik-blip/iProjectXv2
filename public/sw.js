/* Minimal offline shell for iProjectX PWA */
const CACHE = "iprojectx-shell-v2";
const PRECACHE = ["/manifest.webmanifest", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets — cache-first (immutable filenames).
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations: stale-while-revalidate so repeat visits do not always
  // wake the Vercel origin (major Fast Origin Transfer driver).
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        const networkPromise = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => null);
        if (cached) {
          void networkPromise;
          return cached;
        }
        return (
          (await networkPromise) ||
          (await caches.match("/")) ||
          (await caches.match("/app/")) ||
          Response.error()
        );
      })(),
    );
  }
});
