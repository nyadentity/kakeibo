// App shell cache — bump this string to ship an update.
const CACHE = "jinkaku-sns-v201";
// Stable cache for the large CDN libraries. Kept across app updates so React /
// Babel are downloaded only once, not on every version bump.
const LIB_CACHE = "jinkaku-libs-v1";

const APP_ASSETS = [
  "./index.html",
  "./manifest.json",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

const LIB_ASSETS = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then(c => Promise.allSettled(APP_ASSETS.map(a => c.add(a)))),
      caches.open(LIB_CACHE).then(async c => {
        for (const url of LIB_ASSETS) {
          const has = await c.match(url);
          if (!has) { try { await c.add(url); } catch {} }
        }
      })
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== LIB_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

function isHtmlRequest(req) {
  if (req.mode === "navigate") return true;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return false;
  return url.pathname.endsWith("/") || url.pathname.endsWith("index.html");
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  // App HTML: NETWORK-FIRST so the newest version loads whenever online.
  // Falls back to the cached copy only when the network is unavailable.
  if (isHtmlRequest(req)) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put("./index.html", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("./index.html").then(c => c || caches.match(req)))
    );
    return;
  }

  // Everything else (CDN libs, icons, manifest): cache-first (fast, no re-download).
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
          const copy = res.clone();
          const target = LIB_ASSETS.includes(req.url) ? LIB_CACHE : CACHE;
          caches.open(target).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
