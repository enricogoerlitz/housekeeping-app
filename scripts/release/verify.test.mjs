// scripts/release/verify.mjs (spec 0014, Task 6; AC-035 to AC-037, AC-040 to AC-046, AC-069,
// AC-073; plan decision 22): every check of the verification after a delivery, each with a good
// and a bad fixture answer, and the wiring of all checks against a fake network and a fake
// Supabase CLI. Nothing here talks to the network.
//
//   node --test scripts/release/verify.test.mjs
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  FOREIGN_ORIGIN,
  apiSearchPath,
  checkAppCsp,
  checkAuthSettings,
  checkCacheRules,
  checkConfigDiff,
  checkDeepLinks,
  checkFunctions,
  checkGraphql,
  checkNetRest,
  checkOldOrigin,
  checkPhotoAccess,
  checkPhotoBucket,
  checkSecurityHeaders,
  checkSeedData,
  checkVersionFile,
  checkVideoBucket,
  projectRef,
  repoFunctions,
  runChecks,
  seedIds,
} from './verify.mjs';

const WEB = 'https://nice-sea-0a1b2c3d.westeurope.azurestaticapps.net';
const SUPABASE = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY = 'sb_publishable_fixture';
const ENTRY = '/_expo/static/js/web/entry-0cbf7d8a164dbcd8869b184ed014a99b.js';

const csp = (connect) =>
  `default-src 'self'; script-src 'self'; connect-src 'self' ${connect}; object-src 'none'; base-uri 'self'`;
const indexHtml = (connect = `${SUPABASE} wss://abcdefghijklmnopqrst.supabase.co`) =>
  `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp(connect)}" /></head><body><div id="root"></div><script src="${ENTRY}" defer></script></body></html>`;

const SECURITY = {
  'content-security-policy': "frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-robots-tag': 'noindex',
};
const res = (status, headers = {}, body = '') => ({ status, headers, body });
const html = (headers = {}) =>
  res(200, { ...SECURITY, 'cache-control': 'no-cache', ...headers }, indexHtml());
const json = (status, value, headers = {}) => res(status, headers, JSON.stringify(value));
const without = (object, key) =>
  Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));

const failed = (results) => results.filter((r) => !r.ok);

describe('AC-035: security headers', () => {
  test('all headers on / and /index.html: ok', () => {
    const result = checkSecurityHeaders({ '/': html(), '/index.html': html() });
    assert.equal(result.ok, true, result.detail);
  });

  test('missing HSTS on /index.html: FEHLER with the header and the path', () => {
    const result = checkSecurityHeaders({
      '/': html(),
      '/index.html': res(200, without(SECURITY, 'strict-transport-security'), indexHtml()),
    });
    assert.equal(result.ok, false);
    assert.match(result.detail, /\/index\.html.*Strict-Transport-Security/);
  });

  test("CSP header without frame-ancestors 'none', wrong nosniff, no noindex: each named", () => {
    const result = checkSecurityHeaders({
      '/': html({ 'content-security-policy': "default-src 'self'", 'x-content-type-options': 'x' }),
      '/index.html': res(200, without(SECURITY, 'x-robots-tag'), ''),
    });
    assert.equal(result.ok, false);
    assert.match(result.detail, /frame-ancestors/);
    assert.match(result.detail, /X-Content-Type-Options/);
    assert.match(result.detail, /X-Robots-Tag/);
  });

  test('a server that does not answer is FEHLER, not a crash', () => {
    const result = checkSecurityHeaders({ '/': { error: 'ENOTFOUND' }, '/index.html': html() });
    assert.equal(result.ok, false);
    assert.match(result.detail, /nicht erreichbar \(ENOTFOUND\)/);
  });
});

describe('AC-035, AC-013: the CSP of the app names only this Supabase project', () => {
  test('own project in connect-src: ok', () => {
    assert.equal(checkAppCsp(indexHtml(), SUPABASE).ok, true);
  });

  test('another Supabase project or localhost: FEHLER without naming it', () => {
    for (const connect of [
      `${SUPABASE} https://zzzzzzzzzzzzzzzzzzzz.supabase.co`,
      `${SUPABASE} http://127.0.0.1:54321`,
      `${SUPABASE} ws://localhost:54321`,
      'https://zzzzzzzzzzzzzzzzzzzz.supabase.co',
    ]) {
      const result = checkAppCsp(indexHtml(connect), SUPABASE);
      assert.equal(result.ok, false, connect);
      assert.doesNotMatch(result.detail, /zzzz/);
    }
  });

  test('no CSP meta at all: FEHLER', () => {
    assert.equal(checkAppCsp('<html></html>', SUPABASE).ok, false);
  });
});

describe('AC-036: cache rules', () => {
  const good = {
    '/index.html': html(),
    '/sw.js': res(200, { 'cache-control': 'no-cache' }),
    '/register-sw.js': res(200, { 'cache-control': 'no-cache' }),
    '/version.json': res(200, { 'cache-control': 'no-cache' }),
    [ENTRY]: res(200, { 'cache-control': 'public, max-age=31536000, immutable' }),
  };

  test('no-cache for the four files, immutable for /_expo/static/: ok', () => {
    const result = checkCacheRules(good, ENTRY);
    assert.equal(result.ok, true, result.detail);
  });

  test('sw.js cached, the bundle without immutable: FEHLER for both', () => {
    const result = checkCacheRules(
      {
        ...good,
        '/sw.js': res(200, { 'cache-control': 'max-age=3600' }),
        [ENTRY]: res(200, { 'cache-control': 'public, max-age=31536000' }),
      },
      ENTRY,
    );
    assert.equal(result.ok, false);
    assert.match(result.detail, /\/sw\.js/);
    assert.match(result.detail, /_expo\/static/);
  });

  test('no bundle file in index.html: FEHLER', () => {
    assert.equal(checkCacheRules(good, undefined).ok, false);
  });
});

describe('AC-037: deep links and missing files', () => {
  const app = res(200, { 'content-type': 'text/html' }, indexHtml());

  test('a deep link answers with the app, a missing bundle file with 404: ok', () => {
    const result = checkDeepLinks({ deep: app, missing: res(404, {}, 'Not found') }, ENTRY);
    assert.equal(result.ok, true, result.detail);
  });

  test('200 with the app instead of 404 for the missing file: FEHLER', () => {
    const result = checkDeepLinks({ deep: app, missing: app }, ENTRY);
    assert.equal(result.ok, false);
    assert.match(result.detail, /404/);
  });

  test('a deep link with 404: FEHLER', () => {
    const result = checkDeepLinks({ deep: res(404), missing: res(404) }, ENTRY);
    assert.equal(result.ok, false);
    assert.match(result.detail, /\/rezept\//);
  });
});

describe('version.json (AC-069, AC-027)', () => {
  const file = json(200, { version: '2026.12.4', commit: 'a'.repeat(40) });

  test('version and commit as expected: ok', () => {
    assert.equal(checkVersionFile(file, {}).ok, true);
    assert.equal(checkVersionFile(file, { version: '2026.12.4', commit: 'a'.repeat(40) }).ok, true);
  });

  test('an older version or another commit: FEHLER', () => {
    assert.equal(checkVersionFile(file, { version: '2026.12.5' }).ok, false);
    assert.equal(checkVersionFile(file, { commit: 'b'.repeat(40) }).ok, false);
  });

  test('not JSON: FEHLER', () => {
    assert.equal(checkVersionFile(res(200, {}, '<html>'), {}).ok, false);
  });
});

describe('AC-041: auth settings', () => {
  const settings = (external) =>
    json(200, {
      external: { anonymous_users: false, email: false, phone: false, google: true, ...external },
      disable_signup: false,
    });

  test('email, phone and anonymous off, Google on: ok', () => {
    assert.equal(checkAuthSettings(settings({})).ok, true);
  });

  test('email: true is FEHLER', () => {
    const result = checkAuthSettings(settings({ email: true }));
    assert.equal(result.ok, false);
    assert.match(result.detail, /email/);
  });

  test('Google off or anonymous on: FEHLER', () => {
    assert.match(checkAuthSettings(settings({ google: false })).detail, /google/);
    assert.match(checkAuthSettings(settings({ anonymous_users: true })).detail, /anonymous_users/);
  });

  test('401 (no key) is FEHLER', () => {
    assert.equal(checkAuthSettings(json(401, { message: 'No API key found' })).ok, false);
  });
});

describe('AC-044: functions without authorization', () => {
  test('401 and 403 from both origins: ok', () => {
    const result = checkFunctions([
      { name: 'ai-search', origin: 'eigene', response: res(401) },
      { name: 'ai-search', origin: 'fremde', response: res(403) },
    ]);
    assert.equal(result.ok, true, result.detail);
  });

  test('200 from a foreign origin: FEHLER naming function and origin', () => {
    const result = checkFunctions([
      { name: 'ai-search', origin: 'eigene', response: res(401) },
      { name: 'resolve-maps-link', origin: 'fremde', response: res(200, {}, '{"url":"x"}') },
    ]);
    assert.equal(result.ok, false);
    assert.match(result.detail, /resolve-maps-link.*fremde.*200/);
  });

  test('404 (function missing) and 500 are FEHLER too', () => {
    assert.equal(
      checkFunctions([{ name: 'media-sweep', origin: 'eigene', response: res(404) }]).ok,
      false,
    );
    assert.equal(
      checkFunctions([{ name: 'media-sweep', origin: 'eigene', response: res(500) }]).ok,
      false,
    );
  });

  test('no function at all: FEHLER', () => {
    assert.equal(checkFunctions([]).ok, false);
  });

  test('the functions of the repository are the folders with an index.ts', () => {
    const names = repoFunctions();
    assert.ok(names.includes('media-sweep'));
    assert.ok(names.includes('ai-search'));
    assert.ok(!names.includes('_shared'));
    assert.ok(!names.includes('node_modules'));
  });
});

describe('AC-073: pg_net not reachable over the API', () => {
  const pgrst106 = json(406, {
    code: 'PGRST106',
    message: 'Invalid schema: net',
    hint: 'Only the following schemas are exposed: public, graphql_public',
  });

  test('406 PGRST106 for the RPC and the table: ok', () => {
    assert.equal(checkNetRest({ rpc: pgrst106, table: pgrst106 }).ok, true);
  });

  test('net exposed: the RPC answers 400 or 200: FEHLER', () => {
    const result = checkNetRest({
      rpc: json(400, { code: 'PGRST202' }),
      table: json(200, []),
    });
    assert.equal(result.ok, false);
    assert.match(result.detail, /http_post/);
    assert.match(result.detail, /http_request_queue/);
  });

  const introspection = (types) => ({ data: { __schema: { types } } });
  const unknownField = (field) => ({
    data: null,
    errors: [{ message: `Unknown field "${field}" on type Query` }],
  });
  const PROBE_OK = unknownField('http_request_queueCollection');

  test('introspection without net types and fields, the probe unknown: ok', () => {
    const result = checkGraphql('anon', {
      introspection: introspection([
        { name: 'Query', fields: [{ name: 'recipesCollection' }] },
        { name: 'recipes', fields: [{ name: 'id' }] },
        { name: 'String', fields: null },
      ]),
      probe: PROBE_OK,
    });
    assert.equal(result.ok, true, result.detail);
  });

  test('type http_request_queue in the introspection: FEHLER', () => {
    const result = checkGraphql('authenticated', {
      introspection: introspection([
        { name: 'Query', fields: [{ name: 'recipesCollection' }] },
        { name: 'http_request_queue', fields: [{ name: 'id' }] },
      ]),
      probe: PROBE_OK,
    });
    assert.equal(result.ok, false);
    assert.match(result.detail, /authenticated/);
    assert.match(result.detail, /http_request_queue/);
  });

  test('field http_post on Mutation or an inflected type name: FEHLER', () => {
    for (const types of [
      [{ name: 'Mutation', fields: [{ name: 'http_post' }] }],
      [{ name: 'HttpRequestQueueConnection', fields: [] }],
      [{ name: '_http_response', fields: [] }],
    ]) {
      assert.equal(
        checkGraphql('anon', { introspection: introspection(types), probe: PROBE_OK }).ok,
        false,
        JSON.stringify(types),
      );
    }
  });

  test('introspection switched off (pg_graphql 1.6) counts as ok when the probe is unknown', () => {
    const result = checkGraphql('anon', {
      introspection: unknownField('__schema'),
      probe: PROBE_OK,
    });
    assert.equal(result.ok, true, result.detail);
    assert.match(result.detail, /abgeschaltet/);
  });

  test('the probe finds the queue: FEHLER even with introspection off', () => {
    const result = checkGraphql('anon', {
      introspection: unknownField('__schema'),
      probe: { data: { http_request_queueCollection: { __typename: 'x' } } },
    });
    assert.equal(result.ok, false);
  });

  test('pg_graphql not enabled: ok', () => {
    const off = { errors: [{ message: 'pg_graphql extension is not enabled.' }] };
    assert.equal(checkGraphql('anon', { introspection: off, probe: off }).ok, true);
  });

  test('any other answer is FEHLER, not a pass', () => {
    assert.equal(checkGraphql('anon', { introspection: {}, probe: PROBE_OK }).ok, false);
    assert.equal(checkGraphql('anon', { introspection: undefined, probe: undefined }).ok, false);
  });

  test('the search path of the API comes from [api] in supabase/config.toml', () => {
    assert.equal(apiSearchPath(), 'public, graphql_public, extensions');
  });
});

describe('AC-042: no seed data in production', () => {
  test('seed ids are the households and accounts of supabase/seed.sql', () => {
    const { households, accounts } = seedIds();
    assert.ok(households.includes('c1437b0b-9d8a-50e6-b93b-6a826feaae34'));
    assert.ok(accounts.includes('ecc63aaa-a39f-59d0-b7c7-55980a57c2f3'));
    assert.ok(!accounts.includes('00000000-0000-0000-0000-000000000000'));
  });

  const row = { example_accounts: 0, seed_households: 0, seed_accounts: 0 };

  test('nothing found: ok', () => {
    assert.equal(checkSeedData(row, 'production').ok, true);
  });

  test('an @example.com account or a seed household: FEHLER with counts only', () => {
    const result = checkSeedData(
      { ...row, example_accounts: '2', seed_households: 1 },
      'production',
    );
    assert.equal(result.ok, false);
    assert.match(result.detail, /2 Konto/);
    assert.match(result.detail, /1 Haushalt/);
  });

  test('preview: its demo households are expected, @example.com accounts are not', () => {
    assert.equal(
      checkSeedData({ ...row, seed_households: 2, seed_accounts: 2 }, 'preview').ok,
      true,
    );
    assert.equal(checkSeedData({ ...row, example_accounts: 1 }, 'preview').ok, false);
  });
});

describe('spec 0043, decision 8: video bucket', () => {
  const bucket = { public: false, file_size_limit: 52428800, allowed_mime_types: ['video/mp4'] };

  test('private, 50 MiB, only video/mp4: ok', () => {
    assert.equal(checkVideoBucket(bucket).ok, true);
  });

  test('missing (the backup would silently hold no videos), public, larger, another type: FEHLER', () => {
    assert.match(checkVideoBucket(null).detail, /household-videos fehlt/);
    assert.match(checkVideoBucket({ ...bucket, public: true }).detail, /öffentlich/);
    assert.match(checkVideoBucket({ ...bucket, file_size_limit: 104857600 }).detail, /50 MiB/);
    assert.match(
      checkVideoBucket({ ...bucket, allowed_mime_types: ['video/mp4', 'video/webm'] }).detail,
      /video\/mp4/,
    );
  });
});

describe('AC-046: photo bucket', () => {
  const bucket = { public: false, file_size_limit: 2097152, allowed_mime_types: ['image/jpeg'] };

  test('private, 2 MiB, only image/jpeg: ok', () => {
    assert.equal(checkPhotoBucket(bucket).ok, true);
  });

  test('public, larger, or another type: FEHLER', () => {
    assert.match(checkPhotoBucket({ ...bucket, public: true }).detail, /öffentlich/);
    assert.match(checkPhotoBucket({ ...bucket, file_size_limit: 5242880 }).detail, /2 MiB/);
    assert.match(
      checkPhotoBucket({ ...bucket, allowed_mime_types: ['image/jpeg', 'image/png'] }).detail,
      /image\/jpeg/,
    );
    assert.match(checkPhotoBucket(null).detail, /fehlt/);
  });

  test('a photo without sign-in fails: ok; served: FEHLER', () => {
    assert.equal(
      checkPhotoAccess([
        { kind: 'public', response: res(400) },
        { kind: 'authenticated', response: res(400) },
      ]).ok,
      true,
    );
    const served = checkPhotoAccess([{ kind: 'public', response: res(200, {}, 'JPEGDATA') }]);
    assert.equal(served.ok, false);
    assert.doesNotMatch(served.detail, /JPEGDATA/);
  });

  test('no photo in production yet: ok with a note', () => {
    const result = checkPhotoAccess(undefined);
    assert.equal(result.ok, true);
    assert.match(result.detail, /kein Foto/);
  });
});

describe('AC-040: config diff', () => {
  test('exit 0: ok', () => {
    assert.equal(checkConfigDiff({ status: 0, stdout: '' }).ok, true);
  });

  test('exit 2: FEHLER with the number of differing lines, never their content', () => {
    const result = checkConfigDiff({
      status: 2,
      stdout: '--- remote\n+++ local\n-site_url = "https://old"\n+site_url = "https://new"\n',
    });
    assert.equal(result.ok, false);
    assert.match(result.detail, /2 Zeile/);
    assert.doesNotMatch(result.detail, /https/);
  });

  test('exit 1 (error): FEHLER', () => {
    assert.match(checkConfigDiff({ status: 1, stdout: '' }).detail, /Exit 1/);
  });
});

describe('project ref', () => {
  test('from the Supabase address', () => {
    assert.equal(projectRef(SUPABASE), 'abcdefghijklmnopqrst');
    assert.equal(projectRef('http://127.0.0.1:54321'), undefined);
  });
});

describe('spec 0027, AC-042, AC-043: the old azurestaticapps.net address redirects', () => {
  const OLD = 'https://brave-bush-089e7a80f.6.azurestaticapps.net';
  const OWN = 'https://house.kuschel-nest.de';

  test('301 or 308 to the same path on the own domain is ok', () => {
    for (const status of [301, 308]) {
      const r = checkOldOrigin(res(status, { location: `${OWN}/kalender` }), OWN, OLD);
      assert.equal(r.ok, true, r.detail);
      assert.equal(r.name, 'Alte Adresse');
    }
  });

  test('200 from the old address is "Alte Adresse leitet nicht um"', () => {
    const r = checkOldOrigin(res(200), OWN, OLD);
    assert.equal(r.ok, false);
    assert.match(r.detail, /Alte Adresse leitet nicht um/);
  });

  test('a redirect elsewhere, a 302, no answer or no old address given is FEHLER', () => {
    assert.equal(
      checkOldOrigin(res(301, { location: 'https://fremd.example/kalender' }), OWN, OLD).ok,
      false,
    );
    assert.equal(checkOldOrigin(res(302, { location: `${OWN}/kalender` }), OWN, OLD).ok, false);
    assert.equal(checkOldOrigin({ error: 'ENOTFOUND' }, OWN, OLD).ok, false);
    const missing = checkOldOrigin(undefined, OWN, '');
    assert.equal(missing.ok, false);
    assert.match(missing.detail, /nicht angegeben/);
  });
});

describe('wiring', () => {
  /** A fake network: every answer as production should give it. */
  function goodNetwork() {
    const requests = [];
    const pgrst106 = json(406, { code: 'PGRST106' });
    const unknown = (field) =>
      json(200, { data: null, errors: [{ message: `Unknown field "${field}" on type Query` }] });
    const routes = {
      [`${WEB}/`]: () => html(),
      [`${WEB}/index.html`]: () => html(),
      [`${WEB}/sw.js`]: () => res(200, { 'cache-control': 'no-cache' }),
      [`${WEB}/register-sw.js`]: () => res(200, { 'cache-control': 'no-cache' }),
      [`${WEB}/version.json`]: () =>
        json(
          200,
          { version: '2026.12.4', commit: 'c'.repeat(40) },
          { 'cache-control': 'no-cache' },
        ),
      [`${WEB}${ENTRY}`]: () =>
        res(200, { 'cache-control': 'public, max-age=31536000, immutable' }),
      [`${WEB}/rezept/00000000-0000-4000-8000-000000000000`]: () => html(),
      [`${WEB}/_expo/static/js/web/gibt-es-nicht.js`]: () => res(404, {}, 'Not found'),
      [`${SUPABASE}/auth/v1/settings`]: () =>
        json(200, {
          external: { anonymous_users: false, email: false, phone: false, google: true },
        }),
      [`${SUPABASE}/rest/v1/rpc/http_post`]: () => pgrst106,
      [`${SUPABASE}/rest/v1/http_request_queue`]: () => pgrst106,
      [`${SUPABASE}/graphql/v1`]: (init) =>
        JSON.parse(init.body).query.includes('__schema')
          ? unknown('__schema')
          : unknown('http_request_queueCollection'),
    };
    const fetchImpl = async (url, init = {}) => {
      requests.push({ url, init });
      if (url.startsWith(`${SUPABASE}/functions/v1/`)) return res(401);
      if (url.startsWith(`${SUPABASE}/storage/v1/object/`)) return res(400);
      const route = routes[url];
      if (!route) throw new Error(`unexpected request ${url}`);
      return route(init);
    };
    return { requests, fetchImpl };
  }

  function goodCli() {
    const calls = [];
    const cli = (args) => {
      calls.push(args);
      if (args[0] === 'config') return { status: 0, stdout: '' };
      const sql = args.at(-1);
      if (sql.includes('graphql_public.graphql')) {
        const unknown = (field) => ({
          data: null,
          errors: [{ message: `Unknown field "${field}" on type Query` }],
        });
        return {
          status: 0,
          stdout: JSON.stringify([
            {
              role: 'authenticated',
              introspection: unknown('__schema'),
              probe: unknown('http_request_queueCollection'),
            },
          ]),
        };
      }
      return {
        status: 0,
        stdout: JSON.stringify([
          {
            example_accounts: 0,
            seed_households: 0,
            seed_accounts: 0,
            bucket: {
              public: false,
              file_size_limit: 2097152,
              allowed_mime_types: ['image/jpeg'],
            },
            sample_photo: 'c1437b0b/recipes/x.jpg',
            video_bucket: {
              public: false,
              file_size_limit: 52428800,
              allowed_mime_types: ['video/mp4'],
            },
          },
        ]),
      };
    };
    return { calls, cli };
  }

  const options = (network, cli) => ({
    webOrigin: WEB,
    supabaseUrl: SUPABASE,
    key: KEY,
    environment: 'production',
    expect: { version: '2026.12.4' },
    fetchImpl: network.fetchImpl,
    supabaseCli: cli.cli,
  });

  test('spec 0027: with --old-origin the old address is asked for /kalender without following', async () => {
    const network = goodNetwork();
    const OLD = 'https://old-0a1b2c3d.azurestaticapps.net';
    const inner = network.fetchImpl;
    network.fetchImpl = async (url, init = {}) =>
      url === `${OLD}/kalender` ? res(308, { location: `${WEB}/kalender` }) : inner(url, init);
    const results = await runChecks({ ...options(network, goodCli()), oldOrigin: OLD });
    assert.deepEqual(failed(results), []);
    assert.ok(results.some((r) => r.name === 'Alte Adresse' && r.ok));
  });

  test('all good: every check ok', async () => {
    const results = await runChecks(options(goodNetwork(), goodCli()));
    assert.deepEqual(failed(results), []);
    assert.ok(results.length >= 12, String(results.length));
  });

  test('functions are called without Authorization from the own and a foreign origin', async () => {
    const network = goodNetwork();
    await runChecks(options(network, goodCli()));
    const calls = network.requests.filter((r) => r.url.includes('/functions/v1/'));
    assert.equal(calls.length, repoFunctions().length * 2);
    for (const call of calls) {
      assert.equal(call.init.method, 'POST');
      assert.ok(!('authorization' in call.init.headers) && !('Authorization' in call.init.headers));
    }
    assert.deepEqual(
      [...new Set(calls.map((c) => c.init.headers.origin))].sort(),
      [FOREIGN_ORIGIN, WEB].sort(),
    );
  });

  test('net is asked with Content-Profile and Accept-Profile as anon', async () => {
    const network = goodNetwork();
    await runChecks(options(network, goodCli()));
    const rpc = network.requests.find((r) => r.url.endsWith('/rest/v1/rpc/http_post'));
    const table = network.requests.find((r) => r.url.endsWith('/rest/v1/http_request_queue'));
    assert.equal(rpc.init.headers['content-profile'], 'net');
    assert.equal(table.init.headers['accept-profile'], 'net');
    assert.equal(rpc.init.headers.apikey, KEY);
  });

  test('the CLI output of an agent run ({ rows } with a boundary) is read as well', async () => {
    const plain = goodCli();
    const wrapped = {
      calls: plain.calls,
      cli: (args) => {
        const out = plain.cli(args);
        if (args[0] !== 'db') return out;
        const rows = JSON.parse(out.stdout);
        return { ...out, stdout: `Target: project x\n${JSON.stringify({ boundary: 'b', rows })}` };
      },
    };
    const results = await runChecks(options(goodNetwork(), wrapped));
    for (const name of [
      'Keine Seed-Daten',
      'Foto-Bucket',
      'Video-Bucket',
      'GraphQL ohne net (authenticated)',
    ]) {
      assert.equal(results.find((r) => r.name === name)?.ok, true, name);
    }
  });

  test('the database is only read: --read-only, except the GraphQL probe that must switch role', async () => {
    const cli = goodCli();
    await runChecks(options(goodNetwork(), cli));
    const queries = cli.calls.filter((args) => args[0] === 'db');
    assert.ok(queries.length >= 2);
    for (const args of queries) {
      assert.deepEqual(args.slice(0, 2), ['db', 'query']);
      assert.ok(args.includes('--remote=abcdefghijklmnopqrst'), args.join(' '));
      // The read-only role of the CLI may not `set role authenticated`; that one fixed query runs
      // with --yes and only reads (set_config is local to its transaction).
      const graphqlProbe = args.at(-1).includes('graphql_public.graphql');
      assert.equal(args.includes('--read-only'), !graphqlProbe, args.join(' '));
      assert.equal(args.includes('--yes'), graphqlProbe, args.join(' '));
      if (graphqlProbe)
        assert.doesNotMatch(args.at(-1), /\b(insert|update|delete|create|drop|alter)\b/i);
    }
    const diff = cli.calls.find((args) => args[0] === 'config');
    assert.deepEqual(diff, ['config', 'diff', '--remote=abcdefghijklmnopqrst', '--exit-code']);
    const graphql = queries.find((args) => args.at(-1).includes('graphql_public.graphql')).at(-1);
    assert.match(graphql, /set_config\('role', 'authenticated', true\)/);
    assert.match(
      graphql,
      /set_config\('search_path', 'public, graphql_public, extensions', true\)/,
    );
  });

  test('a failing database query is FEHLER for its checks, the others still run', async () => {
    const network = goodNetwork();
    const results = await runChecks(
      options(network, {
        cli: (args) =>
          args[0] === 'config'
            ? { status: 0, stdout: '' }
            : {
                status: 1,
                stdout:
                  '{"_tag":"Error","error":{"code":"DbQueryExecError","message":"secret detail"}}',
              },
      }),
    );
    const bad = failed(results);
    assert.ok(bad.length >= 3, JSON.stringify(bad));
    assert.ok(bad.every((r) => !/secret detail/.test(r.detail)));
    assert.ok(bad.some((r) => /DbQueryExecError/.test(r.detail)));
    assert.ok(results.some((r) => r.name === 'Kopfzeilen' && r.ok));
  });

  test('a photo is fetched without sign-in only with the publishable key', async () => {
    const network = goodNetwork();
    await runChecks(options(network, goodCli()));
    const photos = network.requests.filter((r) => r.url.includes('/storage/v1/object/'));
    assert.equal(photos.length, 2);
    for (const call of photos) assert.ok(!('authorization' in (call.init.headers ?? {})));
  });
});
