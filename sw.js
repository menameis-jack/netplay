/* NetPlay Queue offline support. Bump VERSION when this file changes. */
const VERSION = "np-offline-2";
const CORE = ["./", "index.html"];
const LIBS = [
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"
];
const LIB_HOSTS = ["cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    // The PDF tools are stored too, so PDF export works without internet. A failure here must not block the install.
    await Promise.all(LIBS.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { mode: "cors" }));
        if (res.ok) await cache.put(url, res);
      } catch (e) { /* stored later, on first use */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(fallbackKey || request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(fallbackKey || request, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request.url);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === "opaque")) cache.put(request.url, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (LIB_HOSTS.includes(url.hostname)) { event.respondWith(cacheFirst(req)); return; }
  if (url.origin !== self.location.origin) return;
  // The app page: always try the internet first so updates show at once, and fall back to the saved copy offline.
  if (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) {
    event.respondWith(networkFirst(req, "index.html"));
    return;
  }
  // The cancelled-codes list must always come fresh from the internet, so it is never stored here.
  if (url.pathname.endsWith("/sw.js") || url.pathname.endsWith("/revoked.json")) return;
  event.respondWith(networkFirst(req));
});
