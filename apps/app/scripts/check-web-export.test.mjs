// Pins what check-web-export.mjs rejects: the ways an export could weaken the CSP or carry an
// inline script past the check (security re-check, spec 0003).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkExport } from './check-web-export.mjs';

const supabaseUrl = 'https://abc.supabase.co';

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
    hasServiceWorker: true,
    supabaseUrl,
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
