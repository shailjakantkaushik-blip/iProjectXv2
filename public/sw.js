/* Workspace PWA shell — public landing is never intercepted. */
const CACHE = "iprojectx-shell-v4";
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

  // Never intercept the marketing site — stale HTML here blanks phones after deploys.
  if (req.mode === "navigate") {
    const path = url.pathname;
    if (
      path === "/" ||
      path.startsWith("/contact") ||
      path.startsWith("/legal") ||
      path.startsWith("/auth") ||
      path.startsWith("/o/")
    ) {
      return;
    }
    event.respondWith(fetch(req));
    return;
  }

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
  }
});
