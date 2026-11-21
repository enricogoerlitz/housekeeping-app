// Pins what check-web-export.mjs rejects: the ways an export could weaken the CSP or carry an
// inline script past the check (security re-check, spec 0003).
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';

import { checkExport } from './check-web-export.mjs';

const supabaseUrl = 'https://abc.supabase.co';
// The application server public key of RFC 8291 Appendix A: a published test value, no secret.
const vapidPublicKey =
  'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const serviceWorker =
  "self.addEventListener('fetch', f); self.addEventListener('push', p); self.addEventListener('notificationclick', c);";

const validDirectives = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: blob:",
  'connect-src':
    "'self' https://abc.supabase.co wss://abc.supabase.co https://*.stt.speech.microsoft.com",
  'object-src': "'none'",
  'base-uri': "'self'",
};

function exportWith({
  directives = {},
  body = '<script src="/_expo/app.js" defer></script>',
} = {}) {
  const csp = Object.entries({ ...validDirectives, ...directives })
    .filter(([, values]) => values !== undefined)
    .map(([name, values]) => `${name} ${values}`)
    .join('; ');
  return {
    html: `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}" /></head><body>${body}</body></html>`,
    serviceWorker,
    supabaseUrl,
    vapidPublicKey,
  };
}

test('a valid export passes', () => {
  assert.deepEqual(checkExport(exportWith()), []);
});

test('hashes in script-src-elem pass', () => {
  assert.deepEqual(
    checkExport(exportWith({ directives: { 'script-src-elem': "'self' 'sha256-abc='" } })),
    [],
  );
});

test('rejects a script-src-elem that allows a host and unsafe-inline', () => {
  const problems = checkExport(
    exportWith({ directives: { 'script-src-elem': "https://evil.example 'unsafe-inline'" } }),
  );
  assert.ok(problems.some((problem) => problem.startsWith('script-src-elem')));
});

test('rejects a script-src-attr with unsafe-hashes', () => {
  const problems = checkExport(
    exportWith({ directives: { 'script-src-attr': "'unsafe-hashes'" } }),
  );
  assert.ok(problems.some((problem) => problem.startsWith('script-src-attr')));
});

test('rejects an upper-case inline script', () => {
  const problems = checkExport(exportWith({ body: '<SCRIPT>alert(1)</SCRIPT>' }));
  assert.ok(problems.includes('index.html contains an inline script'));
});

test('rejects an inline script that only has a data-src attribute', () => {
  const problems = checkExport(exportWith({ body: '<script data-src="x">alert(1)</script>' }));
  assert.ok(problems.includes('index.html contains an inline script'));
});

test('rejects wildcards and bare schemes in connect-src', () => {
  for (const value of ['*', 'https:', 'wss:', 'http:']) {
    const problems = checkExport(
      exportWith({ directives: { 'connect-src': `'self' https://abc.supabase.co ${value}` } }),
    );
    assert.ok(
      problems.some((problem) => problem.startsWith('connect-src')),
      `connect-src ${value} must be rejected`,
    );
  }
});

test('rejects a missing base-uri', () => {
  const problems = checkExport(exportWith({ directives: { 'base-uri': undefined } }));
  assert.ok(problems.includes("base-uri must be exactly 'self'"));
});

test('rejects a missing service worker', () => {
  const problems = checkExport({ ...exportWith(), serviceWorker: undefined });
  assert.ok(problems.includes('sw.js is missing'));
});

test('AC-009: rejects a service worker without push handling', () => {
  for (const event of ['push', 'notificationclick']) {
    const problems = checkExport({
      ...exportWith(),
      serviceWorker: serviceWorker.replace(`'${event}'`, "'other'"),
    });
    assert.ok(problems.includes(`sw.js has no ${event} handler`), event);
  }
});

test('rejects a missing or broken public VAPID key', () => {
  const broken = [
    undefined,
    '',
    'nicht-base64url!',
    vapidPublicKey.slice(0, -4),
    // 65 bytes, but not an uncompressed point (the first byte is not 0x04)
    `C${vapidPublicKey.slice(1)}`,
  ];
  for (const key of broken) {
    const problems = checkExport({ ...exportWith(), vapidPublicKey: key });
    assert.ok(
      problems.some((problem) => problem.startsWith('EXPO_PUBLIC_VAPID_PUBLIC_KEY')),
      String(key),
    );
  }
});

test('AC-046: rejects an export that contains the private VAPID key or the push secret', () => {
  const secrets = {
    VAPID_PRIVATE_KEY: 'private-value-123456',
    PUSH_SEND_SECRET: 'secret-value-7890',
  };
  const files = [
    { path: 'index.html', content: Buffer.from('<html></html>') },
    {
      path: '_expo/static/js/web/entry.js',
      content: Buffer.from('const k="private-value-123456";'),
    },
    { path: 'sw.js', content: Buffer.from('x secret-value-7890 y') },
  ];
  const problems = checkExport({ ...exportWith(), files, secrets });
  assert.ok(problems.includes('the export contains the value of VAPID_PRIVATE_KEY'));
  assert.ok(problems.includes('the export contains the value of PUSH_SEND_SECRET'));
  // Names only, never the values.
  for (const problem of problems) {
    assert.ok(!problem.includes('private-value') && !problem.includes('secret-value'), problem);
  }
});

test('AC-046: a clean export passes the secret scan; unset secrets are skipped', () => {
  const files = [{ path: 'index.html', content: Buffer.from('<html></html>') }];
  const secrets = { VAPID_PRIVATE_KEY: 'private-value-123456', PUSH_SEND_SECRET: undefined };
  assert.deepEqual(checkExport({ ...exportWith(), files, secrets }), []);
});
