// Service worker of the web app (spec 0003, AC-004: the app starts without network).
// Built by scripts/finish-web-export.mjs: workbox-build injects the precache list below
// (PRECACHE). Plain code without Workbox runtime libraries, so nothing else is fetched.
//
// Rules:
// - Only same-origin GET requests are answered from the cache. Supabase (API, auth, functions,
//   realtime), Azure Speech and every other origin always go to the network, never into a cache.
// - Navigations: network first (a fresh app when online), the cached index.html when offline.
// - Hashed bundles, fonts and images: cache first.
// - Each build has its own cache; older ones are removed when the new worker takes over.

const PRECACHE = self.__WB_MANIFEST;
const CACHE_PREFIX = 'housekeeping-precache-';
const INDEX_URL = '/index.html';
const NAVIGATION_TIMEOUT_MS = 3000;
// Paths a reverse proxy could forward to Supabase on the same origin: never cached.
const NEVER_CACHE = ['/rest/', '/auth/', '/functions/', '/realtime/', '/storage/', '/graphql/'];

/** A short version from all revisions, so every build gets its own cache. */
function versionOf(entries) {
  let hash = 5381;
  for (const entry of entries) {
    const text = `${entry.url}@${entry.revision ?? ''}`;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
    }
  }
  return hash.toString(36);
}

const CACHE = CACHE_PREFIX + versionOf(PRECACHE);
const PRECACHED = new Set(PRECACHE.map((entry) => new URL(entry.url, self.location.origin).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(
          PRECACHE.map(
            (entry) => new Request(new URL(entry.url, self.location.origin), { cache: 'reload' }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function cachedIndex() {
  return caches.open(CACHE).then((cache) => cache.match(INDEX_URL));
}

function navigation(request) {
  return new Promise((resolve) => {
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      resolve(cachedIndex().then((cached) => cached ?? fetch(request)));
    };
    const timer = setTimeout(fallback, NAVIGATION_TIMEOUT_MS);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        if (settled) return;
        if (!response.ok) return fallback();
        settled = true;
        resolve(response);
      },
      () => {
        clearTimeout(timer);
        fallback();
      },
    );
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((prefix) => url.pathname.startsWith(prefix))) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
    return;
  }
  const key = url.origin + url.pathname;
  if (!PRECACHED.has(key)) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(key))
      .then((cached) => cached ?? fetch(request)),
  );
});
