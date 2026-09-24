// Offline support: network-first for this app's own files, cached copy when offline.
// ponytail: no precache list — whatever loaded once is available offline after.
const CACHE = "sia-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Only same-origin GETs; API calls and auth always go to the network.
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }) // revalidate, so updates show up on the next load
      .then((res) => {
        if (res.ok) {
          const copy = res.clone(); // clone now, before the page consumes the body
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
