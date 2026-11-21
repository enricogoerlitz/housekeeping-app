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
// - Push (spec 0013, ADR-0014): every push shows a notification, also a broken one (browsers
//   punish silent pushes by revoking the permission). A tap opens only an own path of the app,
//   checked by safeTarget; anything else opens the "Übersicht".

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

// ---------- Push (spec 0013) ----------

const NOTIFICATION_TITLE = 'Housekeeping';
const NOTIFICATION_ICON = '/icons/icon-192.png';
const GENERAL_BODY = 'Öffne die App, um mehr zu sehen.';
const MAX_BODY_LENGTH = 400;
// The same pattern as z.uuid() in packages/core (parseNotificationTarget).
const UUID =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isDay(value) {
  const match = DAY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * The link a tap may open (Decision 12, AC-037, AC-038), rebuilt from its checked parts, or "/".
 * Mirrors parseNotificationTarget in packages/core: only own paths, valid ids and days; of a
 * repeated parameter the first counts, unknown ones and fragments are dropped.
 */
function safeTarget(link) {
  const OVERVIEW = '/';
  if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//')) return OVERVIEW;
  if (link.includes('\\')) return OVERVIEW;
  const pathAndQuery = link.split('#')[0];
  const at = pathAndQuery.indexOf('?');
  const path = at < 0 ? pathAndQuery : pathAndQuery.slice(0, at);
  const params = new Map();
  for (const pair of (at < 0 ? '' : pathAndQuery.slice(at + 1)).split('&')) {
    if (pair === '') continue;
    const equals = pair.indexOf('=');
    try {
      const key = decodeURIComponent(equals < 0 ? pair : pair.slice(0, equals));
      const value = equals < 0 ? '' : decodeURIComponent(pair.slice(equals + 1));
      if (!params.has(key)) params.set(key, value);
    } catch {
      return OVERVIEW;
    }
  }
  const household = params.get('haushalt');
  if (household !== undefined && !UUID.test(household)) return OVERVIEW;
  const withHousehold = (base) =>
    household === undefined
      ? base
      : `${base}${base.includes('?') ? '&' : '?'}haushalt=${household}`;

  switch (path) {
    case '/':
      return withHousehold('/');
    case '/haushalt': {
      const chore = params.get('aufgabe');
      return chore !== undefined && UUID.test(chore)
        ? withHousehold(`/haushalt?aufgabe=${chore}`)
        : OVERVIEW;
    }
    case '/kalender': {
      const day = params.get('tag');
      const entry = params.get('eintrag');
      if (day === undefined || !isDay(day)) return OVERVIEW;
      if (entry !== undefined && !UUID.test(entry)) return OVERVIEW;
      return withHousehold(
        entry === undefined ? `/kalender?tag=${day}` : `/kalender?tag=${day}&eintrag=${entry}`,
      );
    }
    case '/einstellungen/benachrichtigungen':
      return '/einstellungen/benachrichtigungen';
    default:
      return OVERVIEW;
  }
}

/**
 * What a push shows: push-send sends `{title, body, url}` as JSON. The title is always
 * "Housekeeping"; an unreadable message shows the general text and opens the "Übersicht".
 */
function notificationFromPayload(text) {
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    message = undefined;
  }
  const body =
    message !== null &&
    typeof message === 'object' &&
    typeof message.body === 'string' &&
    message.body.trim() !== '' &&
    [...message.body].length <= MAX_BODY_LENGTH
      ? message.body
      : undefined;
  return {
    title: NOTIFICATION_TITLE,
    options: {
      body: body ?? GENERAL_BODY,
      icon: NOTIFICATION_ICON,
      data: { url: body === undefined ? '/' : safeTarget(message.url) },
    },
  };
}

self.addEventListener('push', (event) => {
  let text = '';
  try {
    text = event.data ? event.data.text() : '';
  } catch {
    text = '';
  }
  const { title, options } = notificationFromPayload(text);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = safeTarget(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => typeof client.focus === 'function');
      if (!open) return self.clients.openWindow(path);
      // The app (use-notification-open) checks the path once more and navigates there.
      return open.focus().then((client) => (client ?? open).postMessage({ type: 'open', path }));
    }),
  );
});
