const CACHE_VERSION = "v1";
const STATIC_CACHE = `waichat-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/";

const STATIC_EXTENSIONS = [".js", ".css", ".woff", ".woff2", ".ttf", ".otf", ".ico", ".png", ".webp", ".svg", ".webmanifest", ".json"];

function isStaticAsset(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return STATIC_EXTENSIONS.some((ext) => parsed.pathname.endsWith(ext));
}

function isApiRequest(url) {
  return new URL(url).pathname.startsWith("/api/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([
        OFFLINE_URL,
        "/manifest.json",
        "/favicon.ico",
        "/icon-192.png",
        "/icon-512.png",
      ])
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("waichat-") && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = request.url;

  // Network-first for API calls — never serve stale data
  if (isApiRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache-first for static assets; use status === 200 to avoid caching partial responses
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.status === 200) await cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Network-first for navigation — await cache update so SW isn't terminated early
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.status === 200) {
            const cache = await caches.open(STATIC_CACHE);
            await cache.put(OFFLINE_URL, response.clone());
          }
          return response;
        })
        .catch(() =>
          caches.match(OFFLINE_URL).then((r) => r ?? Response.error())
        )
    );
    return;
  }
});
