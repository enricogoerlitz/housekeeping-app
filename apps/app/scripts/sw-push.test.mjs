// Push handling of the service worker (spec 0013, Task 7): sw-template.js is loaded with node:vm
// into a fake `self`, so the pure helpers and the push / notificationclick handlers run as they
// would in the browser, without a browser. The link cases mirror parseNotificationTarget in
// packages/core/src/notifications.test.ts (Decision 12, AC-037, AC-038).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'sw-template.js'),
  'utf8',
);

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
const CHORE = '22222222-2222-4222-8222-222222222222';
const ENTRY = '33333333-3333-4333-8333-333333333333';

/** Runs the worker in a fresh fake `self`; returns the global and the registered listeners. */
function loadWorker({ windows = [] } = {}) {
  const listeners = new Map();
  const shown = [];
  const opened = [];
  const self = {
    __WB_MANIFEST: [],
    location: { origin: 'https://app.example' },
    addEventListener: (type, listener) => listeners.set(type, listener),
    registration: {
      showNotification: async (title, options) => {
        shown.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url) => {
        opened.push(url);
        return null;
      },
      claim: async () => undefined,
    },
    skipWaiting: async () => undefined,
  };
  self.self = self;
  self.URL = URL;
  self.Map = Map;
  self.Set = Set;
  vm.createContext(self);
  vm.runInContext(source, self);
  return { self, listeners, shown, opened };
}

/** Dispatches an event to the listener and waits for what it handed to waitUntil. */
async function dispatch(listeners, type, event) {
  let pending = Promise.resolve();
  listeners.get(type)({ ...event, waitUntil: (promise) => (pending = promise) });
  await pending;
}

const pushData = (text) => (text === undefined ? null : { text: () => text });

test('AC-009: a valid message shows title, text and link', async () => {
  const { listeners, shown } = loadWorker();
  const url = `/haushalt?aufgabe=${CHORE}&haushalt=${HOUSEHOLD}`;
  await dispatch(listeners, 'push', {
    data: pushData(
      JSON.stringify({
        title: 'Housekeeping',
        body: 'Müll rausbringen · 19:00 · du bist dran',
        url,
      }),
    ),
  });
  assert.equal(shown.length, 1);
  assert.equal(shown[0].title, 'Housekeeping');
  assert.equal(shown[0].options.body, 'Müll rausbringen · 19:00 · du bist dran');
  assert.equal(shown[0].options.icon, '/icons/icon-192.png');
  assert.deepEqual(JSON.parse(JSON.stringify(shown[0].options.data)), { url });
});

test('Decision 24: broken or empty messages still show the general notification', async () => {
  for (const data of [
    pushData('{kaputt'),
    pushData(''),
    null,
    pushData('"nur ein Text"'),
    pushData(JSON.stringify({ title: 'Housekeeping', body: '' })),
    pushData(JSON.stringify({ title: 'Housekeeping', body: 42, url: '/' })),
    pushData(JSON.stringify({ title: 'Housekeeping', body: 'x'.repeat(401), url: '/' })),
  ]) {
    const { listeners, shown } = loadWorker();
    await dispatch(listeners, 'push', { data });
    assert.equal(shown.length, 1);
    assert.equal(shown[0].title, 'Housekeeping');
    assert.equal(shown[0].options.body, 'Öffne die App, um mehr zu sehen.');
    assert.equal(shown[0].options.data.url, '/');
  }
});

test('AC-038: a valid text with a changed link keeps the text and opens the "Übersicht"', async () => {
  const { listeners, shown } = loadWorker();
  await dispatch(listeners, 'push', {
    data: pushData(
      JSON.stringify({
        title: 'Housekeeping',
        body: 'Heute: Lasagne',
        url: 'https://evil.example/',
      }),
    ),
  });
  assert.equal(shown[0].options.body, 'Heute: Lasagne');
  assert.equal(shown[0].options.data.url, '/');
});

test('notificationFromPayload: the title is always "Housekeeping"', () => {
  const { self } = loadWorker();
  const notification = self.notificationFromPayload(
    JSON.stringify({ title: 'Bank', body: 'Bitte anmelden', url: '/' }),
  );
  assert.equal(notification.title, 'Housekeeping');
  assert.equal(notification.options.body, 'Bitte anmelden');
});

test('AC-037: safeTarget keeps every link form of Decision 12', () => {
  const { self } = loadWorker();
  const links = [
    '/',
    `/?haushalt=${HOUSEHOLD}`,
    `/haushalt?aufgabe=${CHORE}&haushalt=${HOUSEHOLD}`,
    `/haushalt?aufgabe=${CHORE}`,
    `/kalender?tag=2026-11-21&eintrag=${ENTRY}&haushalt=${HOUSEHOLD}`,
    `/kalender?tag=2026-11-21&haushalt=${HOUSEHOLD}`,
    '/kalender?tag=2026-11-21',
    '/einstellungen/benachrichtigungen',
  ];
  for (const link of links) assert.equal(self.safeTarget(link), link, link);
});

test('AC-038: safeTarget sends every changed link to the "Übersicht"', () => {
  const { self } = loadWorker();
  const attacks = [
    'https://evil.example/haushalt',
    `https://evil.example/?haushalt=${HOUSEHOLD}`,
    'https://app.example/haushalt',
    'javascript:alert(1)',
    '//evil.example/kalender?tag=2026-11-21',
    '/\\evil.example',
    '/admin',
    '/haushalt/../rezepte',
    '/kalender',
    '/kalender?tag=2026-13-45',
    '/kalender?tag=2026-02-30',
    '/kalender?tag=morgen',
    '/kalender?tag=2026-11-21&eintrag=kaputt',
    '/haushalt',
    '/haushalt?aufgabe=1',
    `/haushalt?aufgabe=${CHORE}&haushalt=nope`,
    `/?haushalt=${HOUSEHOLD}x`,
    '/?haushalt=%',
    '',
    'haushalt',
    undefined,
    null,
    42,
    { url: '/' },
  ];
  for (const attack of attacks) assert.equal(self.safeTarget(attack), '/', String(attack));
});

test('safeTarget rebuilds the link: first value counts, unknown parameters and fragments go', () => {
  const { self } = loadWorker();
  assert.equal(
    self.safeTarget(`/haushalt?utm=1&haushalt=${HOUSEHOLD}&aufgabe=${CHORE}&aufgabe=x#oben`),
    `/haushalt?aufgabe=${CHORE}&haushalt=${HOUSEHOLD}`,
  );
  assert.equal(
    self.safeTarget(`/einstellungen/benachrichtigungen?haushalt=${HOUSEHOLD}&utm=1`),
    '/einstellungen/benachrichtigungen',
  );
});

test('AC-037: a tap with an open window focuses it and tells the app where to go', async () => {
  const messages = [];
  let focused = false;
  const window = {
    url: 'https://app.example/rezepte',
    focus: async () => {
      focused = true;
      return window;
    },
    postMessage: (message) => messages.push(message),
  };
  const { listeners, opened } = loadWorker({ windows: [window] });
  let closed = false;
  const url = `/kalender?tag=2026-11-21&eintrag=${ENTRY}&haushalt=${HOUSEHOLD}`;
  await dispatch(listeners, 'notificationclick', {
    notification: { data: { url }, close: () => (closed = true) },
  });
  assert.equal(closed, true);
  assert.equal(focused, true);
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: 'open', path: url }]);
  assert.deepEqual(opened, []);
});

test('AC-037: a tap without an open window opens the checked link', async () => {
  const { listeners, opened } = loadWorker();
  await dispatch(listeners, 'notificationclick', {
    notification: { data: { url: '/einstellungen/benachrichtigungen' }, close: () => undefined },
  });
  assert.deepEqual(opened, ['/einstellungen/benachrichtigungen']);
});

test('AC-038: a tap on a changed link opens the "Übersicht", never the foreign address', async () => {
  const { listeners, opened } = loadWorker();
  await dispatch(listeners, 'notificationclick', {
    notification: { data: { url: 'https://evil.example/' }, close: () => undefined },
  });
  assert.deepEqual(opened, ['/']);
});
