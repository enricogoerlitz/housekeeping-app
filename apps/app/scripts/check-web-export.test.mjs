// Pins what check-web-export.mjs rejects: the ways an export could weaken the CSP or carry an
// inline script past the check (security re-check, spec 0003), the Static Web Apps configuration
// and the version file (spec 0014) and the secret scan of the bundle (AC-046, AC-061).
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkExport,
  effectiveHeaders,
  precachedUrls,
  scanFiles,
  staticWebAppConfigProblems,
} from './check-web-export.mjs';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const realConfigText = readFileSync(
  path.join(scriptsDir, '../public/staticwebapp.config.json'),
  'utf8',
);

const supabaseUrl = 'https://abc.supabase.co';
const serviceWorker =
  'const PRECACHE = [{"revision":"1","url":"index.html"},{"revision":null,"url":"_expo/static/js/web/entry-1.js"}];' +
  "self.addEventListener('fetch', f);";
const versionFile = '{"version":"2026.12.4","commit":"0123456789abcdef"}\n';

const validDirectives = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: blob:",
  'media-src': "'self' blob:",
  'connect-src':
    "'self' blob: https://abc.supabase.co wss://abc.supabase.co https://*.stt.speech.microsoft.com",
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
    swaConfig: realConfigText,
    versionFile,
  };
}

/** The real configuration with `change` applied to a parsed copy, as JSON text. */
function configWith(change) {
  const config = JSON.parse(realConfigText);
  change(config);
  return JSON.stringify(config);
}

test('a valid export passes', () => {
  assert.deepEqual(checkExport(exportWith()), []);
});

test('spec 0043: media-src is exactly self and blob: (the recipe video plays from a blob URL)', () => {
  assert.match(
    checkExport(exportWith({ directives: { 'media-src': undefined } })).join('\n'),
    /media-src must be exactly 'self' blob:/,
  );
  assert.match(
    checkExport(
      exportWith({
        directives: { 'media-src': "'self' blob: https://v16-webapp-prime.tiktok.com" },
      }),
    ).join('\n'),
    /media-src must be exactly 'self' blob:/,
  );
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

test('spec 0040 AC-015: connect-src allows blob: ("Aus diesem Foto" reads the shown photo)', () => {
  assert.deepEqual(checkExport(exportWith()), []);
  const problems = checkExport(
    exportWith({ directives: { 'connect-src': "'self' https://abc.supabase.co" } }),
  );
  assert.ok(
    problems.includes('connect-src must allow blob: (spec 0040, "Aus diesem Foto")'),
    problems.join('; '),
  );
});

test('rejects wildcards and bare schemes in connect-src', () => {
  for (const value of ['*', 'https:', 'wss:', 'http:', 'data:']) {
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

test('AC-046: rejects an export that contains the value of a given secret', () => {
  const secrets = { SOME_SECRET: 'secret-value-7890' };
  const files = [
    { path: 'index.html', content: Buffer.from('<html></html>') },
    { path: 'sw.js', content: Buffer.from('x secret-value-7890 y') },
  ];
  const problems = checkExport({ ...exportWith(), files, secrets });
  assert.ok(problems.includes('sw.js contains the value of SOME_SECRET'));
  // Names only, never the values.
  for (const problem of problems) assert.ok(!problem.includes('secret-value'), problem);
});

test('AC-046: a clean export passes the secret scan; unset secrets are skipped', () => {
  const files = [{ path: 'index.html', content: Buffer.from('<html></html>') }];
  const secrets = { SOME_SECRET: 'secret-value-7890', UNSET: undefined };
  assert.deepEqual(checkExport({ ...exportWith(), files, secrets }), []);
});

// ---------- Static Web Apps configuration (spec 0014) ----------

test('AC-035: the real configuration sends the security headers on / and /index.html', () => {
  const config = JSON.parse(realConfigText);
  for (const requestPath of ['/', '/index.html']) {
    const headers = effectiveHeaders(config, requestPath);
    assert.equal(headers.get('content-security-policy'), "frame-ancestors 'none'", requestPath);
    assert.equal(headers.get('x-content-type-options'), 'nosniff', requestPath);
    assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin', requestPath);
    assert.match(headers.get('strict-transport-security') ?? '', /^max-age=\d+/, requestPath);
    assert.equal(headers.get('x-robots-tag'), 'noindex', requestPath);
  }
});

test('AC-036: the real configuration sets the cache rules', () => {
  const config = JSON.parse(realConfigText);
  for (const requestPath of ['/index.html', '/sw.js', '/register-sw.js', '/version.json']) {
    assert.equal(
      effectiveHeaders(config, requestPath).get('cache-control'),
      'no-cache',
      requestPath,
    );
  }
  assert.equal(
    effectiveHeaders(config, '/_expo/static/js/web/entry-0123abcd.js').get('cache-control'),
    'public, max-age=31536000, immutable',
  );
  // A deep link is answered by the navigation fallback, which applies no route rule: the
  // global headers alone must keep index.html uncached there too.
  assert.equal(
    effectiveHeaders(config, '/rezept/abc', { fallback: true }).get('cache-control'),
    'no-cache',
  );
});

test('AC-037: deep links fall back to index.html, missing bundles do not', () => {
  const config = JSON.parse(realConfigText);
  assert.equal(config.navigationFallback.rewrite, '/index.html');
  assert.ok(config.navigationFallback.exclude.includes('/_expo/*'));
  assert.deepEqual(staticWebAppConfigProblems(config), []);
});

test('the real configuration passes the check', () => {
  assert.deepEqual(staticWebAppConfigProblems(JSON.parse(realConfigText)), []);
});

test('AC-038: a missing frame-ancestors fails the build with a message naming it', () => {
  const problems = checkExport({
    ...exportWith(),
    swaConfig: configWith((config) => {
      delete config.globalHeaders['Content-Security-Policy'];
    }),
  });
  assert.ok(
    problems.includes(
      "staticwebapp.config.json: / does not send Content-Security-Policy: frame-ancestors 'none'",
    ),
    problems.join('\n'),
  );
});

test('AC-038: a missing cache rule for /sw.js fails the build with a message naming it', () => {
  const problems = checkExport({
    ...exportWith(),
    swaConfig: configWith((config) => {
      config.routes = config.routes.filter((route) => route.route !== '/sw.js');
      delete config.globalHeaders['Cache-Control'];
    }),
  });
  assert.ok(
    problems.includes('staticwebapp.config.json: /sw.js does not send Cache-Control: no-cache'),
    problems.join('\n'),
  );
});

test('AC-038: each missing security header gets its own message', () => {
  for (const header of [
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Strict-Transport-Security',
    'X-Robots-Tag',
  ]) {
    const problems = staticWebAppConfigProblems(
      JSON.parse(
        configWith((config) => {
          delete config.globalHeaders[header];
        }),
      ),
    );
    assert.ok(
      problems.some((problem) => problem.includes(`does not send ${header}`)),
      `${header}: ${problems.join('; ')}`,
    );
  }
});

test('AC-038: a route that removes a security header is caught (first match wins)', () => {
  const problems = staticWebAppConfigProblems(
    JSON.parse(
      configWith((config) => {
        config.routes.unshift({ route: '/index.html', headers: { 'X-Content-Type-Options': '' } });
      }),
    ),
  );
  assert.ok(problems.includes('/index.html does not send X-Content-Type-Options: nosniff'));
});

test('AC-038: an earlier wildcard route that shadows the rule for /sw.js is caught', () => {
  const problems = staticWebAppConfigProblems(
    JSON.parse(
      configWith((config) => {
        config.routes.unshift({ route: '/*.js', headers: { 'Cache-Control': 'max-age=3600' } });
      }),
    ),
  );
  assert.ok(problems.includes('/sw.js does not send Cache-Control: no-cache'));
});

test('AC-036: a missing immutable rule for /_expo/static/ is caught', () => {
  const problems = staticWebAppConfigProblems(
    JSON.parse(
      configWith((config) => {
        config.routes = config.routes.filter((route) => route.route !== '/_expo/static/*');
      }),
    ),
  );
  assert.ok(
    problems.some((problem) =>
      problem.includes('does not send Cache-Control: public, max-age=31536000, immutable'),
    ),
  );
});

test('AC-037: a fallback without the exception for /_expo/* is caught', () => {
  const problems = staticWebAppConfigProblems(
    JSON.parse(
      configWith((config) => {
        config.navigationFallback.exclude = ['/assets/*'];
      }),
    ),
  );
  assert.ok(problems.includes('navigationFallback does not exclude /_expo/*'));
  const none = staticWebAppConfigProblems(
    JSON.parse(
      configWith((config) => {
        delete config.navigationFallback;
      }),
    ),
  );
  assert.ok(none.includes('navigationFallback does not rewrite to /index.html'));
});

test('AC-038: a missing or unreadable configuration fails the build', () => {
  assert.ok(
    checkExport({ ...exportWith(), swaConfig: undefined }).includes(
      'staticwebapp.config.json is missing',
    ),
  );
  assert.ok(
    checkExport({ ...exportWith(), swaConfig: '{ nope' }).includes(
      'staticwebapp.config.json is not valid JSON',
    ),
  );
});

// ---------- Developer switch and connect-src (AC-038, AC-035) ----------

test('AC-038: EXPO_PUBLIC_DEV_LOGIN=1 with a non-local Supabase fails the build', () => {
  const problems = checkExport({ ...exportWith(), devLogin: '1' });
  assert.ok(
    problems.includes('EXPO_PUBLIC_DEV_LOGIN=1 is only allowed with a local Supabase'),
    problems.join('\n'),
  );
});

test('EXPO_PUBLIC_DEV_LOGIN=1 with a local Supabase passes', () => {
  const local = 'http://127.0.0.1:54321';
  const problems = checkExport({
    ...exportWith({
      directives: { 'connect-src': `'self' blob: ${local} ws://127.0.0.1:54321` },
    }),
    supabaseUrl: local,
    devLogin: '1',
  });
  assert.deepEqual(problems, []);
});

test('AC-035: connect-src names no localhost or 127.0.0.1 when Supabase is not local', () => {
  for (const host of ['http://localhost:54321', 'http://127.0.0.1:54321', 'ws://localhost:8081']) {
    const problems = checkExport(
      exportWith({ directives: { 'connect-src': `'self' https://abc.supabase.co ${host}` } }),
    );
    assert.ok(
      problems.includes(`connect-src names a local address (${host}) in a non-local build`),
      `${host}: ${problems.join('; ')}`,
    );
  }
});

// ---------- Version file (AC-023) ----------

test('AC-023: a missing or broken version.json fails the build', () => {
  assert.ok(
    checkExport({ ...exportWith(), versionFile: undefined }).includes('version.json is missing'),
  );
  for (const broken of ['nope', '{"version":"2026.13.1","commit":"x"}', '{"version":"dev"}']) {
    const problems = checkExport({ ...exportWith(), versionFile: broken });
    assert.ok(
      problems.some((problem) => problem.startsWith('version.json')),
      `${broken}: ${problems.join('; ')}`,
    );
  }
  for (const version of ['dev', 'vorschau', '2026.1.1', '2026.12.14']) {
    assert.deepEqual(
      checkExport({ ...exportWith(), versionFile: JSON.stringify({ version, commit: 'local' }) }),
      [],
      version,
    );
  }
});

test('AC-023: version.json in the precache of sw.js fails the build', () => {
  const withVersion = serviceWorker.replace('[{', '[{"revision":"9","url":"version.json"},{');
  assert.deepEqual(precachedUrls(withVersion).slice(0, 1), ['version.json']);
  const problems = checkExport({ ...exportWith(), serviceWorker: withVersion });
  assert.ok(problems.includes('sw.js precaches version.json'), problems.join('\n'));
});

test('AC-062 (0031): a release build without the seed precaches no sample photo', () => {
  const photo = 'assets/__packages/api/assets/photos/lasagne.c50df9ff86202411597cf928af54e52a.jpg';
  const withPhoto = serviceWorker.replace('[{', `[{"revision":null,"url":"${photo}"},{`);
  const problems = checkExport({ ...exportWith(), serviceWorker: withPhoto });
  assert.ok(problems.includes(`sw.js precaches the sample photo ${photo}`), problems.join('\n'));
  // The preview and a local export with the test accounts carry the seed and its photos.
  const preview = '{"version":"vorschau","commit":"0123456789abcdef"}\n';
  assert.deepEqual(
    checkExport({ ...exportWith(), serviceWorker: withPhoto, versionFile: preview }),
    [],
  );
  const local = {
    ...exportWith({
      directives: {
        'connect-src': "'self' blob: http://127.0.0.1:54321 ws://127.0.0.1:54321",
      },
    }),
    supabaseUrl: 'http://127.0.0.1:54321',
    devLogin: '1',
  };
  assert.deepEqual(checkExport({ ...local, serviceWorker: withPhoto }), []);
});

test('staticwebapp.config.json in the precache of sw.js fails the build', () => {
  const withConfig = serviceWorker.replace(
    '[{',
    '[{"revision":"9","url":"staticwebapp.config.json"},{',
  );
  assert.ok(
    checkExport({ ...exportWith(), serviceWorker: withConfig }).includes(
      'sw.js precaches staticwebapp.config.json',
    ),
  );
});

// ---------- Secret scan of the bundle (AC-061) ----------

const file = (filePath, text) => ({ path: filePath, content: Buffer.from(text) });
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (payload) =>
  `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.c2lnbmF0dXJl`;

test('AC-061: finds secret keys, service_role JWTs and the names of server secrets', () => {
  const problems = scanFiles([
    // Built at runtime so this file itself carries no secret-shaped string.
    file('a.js', `const k="${['sb', 'secret', 'Ab1'.repeat(12)].join('_')}";`),
    file('b.js', `const t="${jwt({ iss: 'supabase', role: 'service_role' })}";`),
    file('c.js', 'process.env.FOUNDRY_API_KEY'),
    file('d.js', 'GOOGLE_CLIENT_SECRET'),
  ]);
  assert.deepEqual(problems, [
    'a.js contains a Supabase secret key (sb_secret_…)',
    'b.js contains a service_role JWT',
    'c.js contains the name FOUNDRY_API_KEY',
    'd.js contains the name GOOGLE_CLIENT_SECRET',
  ]);
  for (const problem of problems) assert.ok(!problem.includes('N7UND0'), problem);
});

test('AC-061: the key-prefix check of supabase-js and an anon JWT are no finding', () => {
  // supabase-js tells key kinds apart by prefix; the bare word is in every bundle. The scan
  // therefore looks for a whole key, and for JWTs whose payload has the role service_role.
  const supabaseJs = 'C=e=>e.startsWith("sb_publishable_")||e.startsWith("sb_secret_"),R=new Set;';
  assert.deepEqual(
    scanFiles([
      file('common.js', supabaseJs),
      file('env.js', `const anon="${jwt({ iss: 'supabase', role: 'anon' })}";`),
      file('key.js', 'const k="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";'),
    ]),
    [],
  );
});

test('AC-061: finds the values of the given secrets and names file and variable only', () => {
  const problems = scanFiles([file('_expo/static/js/web/x.js', 'a s3cr3t-value-1234 b')], {
    SUPABASE_ACCESS_TOKEN: 's3cr3t-value-1234',
    OTHER: 'not-in-the-bundle-5678',
  });
  assert.deepEqual(problems, [
    '_expo/static/js/web/x.js contains the value of SUPABASE_ACCESS_TOKEN',
  ]);
});

function scanDir(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-web-export-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

function runScan(args, env = {}) {
  return spawnSync(process.execPath, [path.join(scriptsDir, 'check-web-export.mjs'), ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  });
}

test('AC-061: --scan fails on a value in the bundle and prints no value', () => {
  const dir = scanDir({
    'index.html': '<html></html>',
    '_expo/static/js/web/a.js': 'x=VALUE-0987654321',
  });
  try {
    const result = runScan(['--scan', dir, '--names', 'MY_TOKEN,OTHER_TOKEN'], {
      MY_TOKEN: 'VALUE-0987654321',
      OTHER_TOKEN: 'elsewhere-1234567',
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /_expo\/static\/js\/web\/a\.js contains the value of MY_TOKEN/);
    assert.ok(!(result.stdout + result.stderr).includes('VALUE-0987654321'));
    assert.ok(!(result.stdout + result.stderr).includes('elsewhere-1234567'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AC-061: --scan passes a clean bundle and names what it scanned', () => {
  const dir = scanDir({ 'index.html': '<html></html>' });
  try {
    const result = runScan(['--scan', dir, '--names', 'MY_TOKEN'], {
      MY_TOKEN: 'VALUE-0987654321',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /MY_TOKEN/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AC-061: --scan fails when a named secret is not set (the scan would prove nothing)', () => {
  const dir = scanDir({ 'index.html': '<html></html>' });
  try {
    const result = runScan(['--scan', dir, '--names', 'MY_TOKEN']);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /MY_TOKEN is not set/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--scan without a directory fails with usage', () => {
  const result = runScan(['--scan']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage/);
});
