// The cloud sections of supabase/config.toml and their preparation in the runner (spec 0014,
// Task 7; AC-040, plan decision 6 and threat model „Offene Weiterleitung über Platzhalter“).
//
// The Supabase CLI 3.2.0 picks [remotes.<name>] by its literal project_id; an env() there is not
// resolved for the match, and an unset one breaks every local command. So the committed sections
// carry placeholders, and scripts/ci/supabase-remote.mjs puts the ref of the job's environment
// into a copy that is never committed.
//
//   node --test scripts/ci/supabase-config.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PLACEHOLDER_REFS, prepareRemoteConfig } from './supabase-remote.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configPath = path.join(root, 'supabase/config.toml');
const config = readFileSync(configPath, 'utf8');
const tmp = mkdtempSync(path.join(root, 'tmp', 'supabase-config-test-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

/** { "<section>": { key: raw value } } of a TOML file of our shape (one key per line). */
function sections(text) {
  const out = {};
  let current = '';
  out[current] = {};
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (line === '' || line.startsWith('#')) continue;
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      current = header[1];
      out[current] ??= {};
      continue;
    }
    const pair = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (pair) out[current][pair[1]] = pair[2];
  }
  return out;
}

/** Multi-line arrays joined, so `key = [ … ]` is one line. */
const joinArrays = (text) =>
  text.replace(/=\s*\[([^\]]*)\]/g, (_m, items) => `= [${items.replace(/\s*\n\s*/g, ' ').trim()}]`);

const parsed = sections(joinArrays(config));
const ENVIRONMENTS = { production: 'PRODUCTION', preview: 'PREVIEW' };
const REF = 'abcdefghijklmnopqrst';
const input = (environment, overrides = {}) => {
  const webOrigin =
    environment === 'production'
      ? 'https://brave.example.azurestaticapps.net'
      : 'https://island.example.azurestaticapps.net';
  return {
    environment,
    ref: REF,
    supabaseUrl: `https://${REF}.supabase.co`,
    webOrigin,
    webOriginWildcard: `${webOrigin}/**`,
    ...overrides,
  };
};

describe('AC-040: committed cloud sections', () => {
  test('the local project stays as it is: its own project_id, e-mail on, local redirects', () => {
    assert.equal(parsed['']['project_id'], '"housekeeping-app"');
    assert.equal(parsed['auth.email'].enabled, 'true');
    assert.match(parsed.auth.site_url, /localhost/);
  });

  for (const [environment, prefix] of Object.entries(ENVIRONMENTS)) {
    const section = (name) => parsed[`remotes.${environment}${name ? `.${name}` : ''}`];

    test(`[remotes.${environment}]: placeholder project_id, never a real ref in the repo`, () => {
      assert.equal(section('').project_id, `"${PLACEHOLDER_REFS[environment]}"`);
      assert.match(PLACEHOLDER_REFS[environment], /^[a-z]{20}$/);
    });

    test(`[remotes.${environment}]: site URL and redirects only from env(), exactly the web address`, () => {
      assert.equal(section('auth').site_url, `"env(${prefix}_WEB_ORIGIN)"`);
      assert.equal(
        section('auth').additional_redirect_urls,
        `["env(${prefix}_WEB_ORIGIN)", "env(${prefix}_WEB_ORIGIN_WILDCARD)"]`,
      );
    });

    test(`[remotes.${environment}]: e-mail sign-in off, TLS only`, () => {
      assert.equal(section('auth.email').enabled, 'false');
      assert.equal(section('db.ssl_enforcement').enabled, 'true');
    });

    test(`[remotes.${environment}]: nothing else is overridden (hook, Google, API schemas, seed from the base)`, () => {
      const keys = Object.entries(parsed)
        .filter(
          ([name]) =>
            name === `remotes.${environment}` || name.startsWith(`remotes.${environment}.`),
        )
        .flatMap(([name, pairs]) => Object.keys(pairs).map((key) => `${name}.${key}`))
        .sort();
      assert.deepEqual(keys, [
        `remotes.${environment}.auth.additional_redirect_urls`,
        `remotes.${environment}.auth.email.enabled`,
        `remotes.${environment}.auth.site_url`,
        `remotes.${environment}.db.ssl_enforcement.enabled`,
        `remotes.${environment}.project_id`,
      ]);
    });
  }

  test('no localhost and no wildcard host in any cloud section', () => {
    const cloud = config.slice(config.indexOf('[remotes.'));
    assert.doesNotMatch(cloud, /localhost|127\.0\.0\.1|https?:\/\/\*/);
  });

  test('what the cloud inherits from the base: hook on, Google on from env(), schemas public and graphql_public', () => {
    assert.equal(parsed['auth.hook.before_user_created'].enabled, 'true');
    assert.equal(
      parsed['auth.hook.before_user_created'].uri,
      '"pg-functions://postgres/private/before_user_created_hook"',
    );
    assert.equal(parsed['auth.external.google'].enabled, 'true');
    assert.equal(parsed['auth.external.google'].client_id, '"env(GOOGLE_CLIENT_ID)"');
    assert.equal(parsed['auth.external.google'].secret, '"env(GOOGLE_CLIENT_SECRET)"');
    assert.equal(parsed['auth.external.google'].skip_nonce_check, 'false');
    assert.equal(parsed.api.schemas, '["public", "graphql_public"]');
    assert.equal(parsed.auth.enable_anonymous_sign_ins, 'false');
    assert.equal(parsed['auth.sms'].enabled, 'false');
    assert.equal(parsed.auth.enable_signup, 'true');
  });
});

describe('preparing the copy in the runner', () => {
  test('puts the ref into the section of the environment and drops the other cloud section', () => {
    const prepared = prepareRemoteConfig(config, input('preview'));
    const out = sections(joinArrays(prepared));
    assert.equal(out['remotes.preview'].project_id, `"${REF}"`);
    assert.ok(!Object.keys(out).some((name) => name.startsWith('remotes.production')));
    assert.ok(!prepared.includes(PLACEHOLDER_REFS.preview));
    // The rest of the file is untouched.
    assert.equal(
      prepared.slice(0, config.indexOf('[remotes.')),
      config.slice(0, config.indexOf('[remotes.')),
    );
  });

  test('AC-013: the ref must be the project of the environment’s Supabase address', () => {
    assert.throws(
      () =>
        prepareRemoteConfig(
          config,
          input('production', { supabaseUrl: 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co' }),
        ),
      /SUPABASE_PROJECT_REF passt nicht/,
    );
  });

  test('a ref that is not 20 lowercase letters is refused', () => {
    for (const ref of ['', 'abc', 'ABCDEFGHIJKLMNOPQRST', `${REF}"\n[x]`]) {
      assert.throws(
        () => prepareRemoteConfig(config, input('preview', { ref })),
        /SUPABASE_PROJECT_REF/,
      );
    }
  });

  test('open redirect: only https://<host> of the environment, no path, no wildcard host, no localhost', () => {
    for (const webOrigin of [
      'http://island.example.azurestaticapps.net',
      'https://island.example.azurestaticapps.net/',
      'https://island.example.azurestaticapps.net/app',
      'https://*.azurestaticapps.net',
      'https://localhost:8081',
      'https://127.0.0.1',
      'https://island.example.azurestaticapps.net?x=1',
      '',
    ]) {
      assert.throws(
        () =>
          prepareRemoteConfig(
            config,
            input('preview', { webOrigin, webOriginWildcard: `${webOrigin}/**` }),
          ),
        /WEB_ORIGIN/,
        webOrigin,
      );
    }
  });

  test('the wildcard redirect must be exactly <origin>/**', () => {
    assert.throws(
      () =>
        prepareRemoteConfig(
          config,
          input('preview', { webOriginWildcard: 'https://evil.example/**' }),
        ),
      /WEB_ORIGIN_WILDCARD/,
    );
  });

  test('an unknown environment or a file without the placeholder is refused', () => {
    assert.throws(() => prepareRemoteConfig(config, input('staging')), /Umgebung/);
    const prepared = prepareRemoteConfig(config, input('preview'));
    assert.throws(() => prepareRemoteConfig(prepared, input('preview')), /Platzhalter/);
  });

  test('the CLI writes the prepared file and prints neither ref nor addresses', () => {
    const file = path.join(tmp, 'config.toml');
    writeFileSync(file, config);
    const env = input('production');
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/ci/supabase-remote.mjs'), 'production', '--file', file],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_ACTIONS: '',
          SUPABASE_PROJECT_REF: REF,
          PRODUCTION_SUPABASE_URL: env.supabaseUrl,
          PRODUCTION_WEB_ORIGIN: env.webOrigin,
          PRODUCTION_WEB_ORIGIN_WILDCARD: env.webOriginWildcard,
          GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(file, 'utf8'), new RegExp(`project_id = "${REF}"`));
    const output = `${result.stdout}${result.stderr}`;
    assert.ok(!output.includes(REF) && !output.includes(env.webOrigin), output);
  });

  test('the CLI refuses to run without GOOGLE_CLIENT_ID (config push would turn Google off)', () => {
    const file = path.join(tmp, 'config-no-google.toml');
    writeFileSync(file, config);
    const env = input('preview');
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/ci/supabase-remote.mjs'), 'preview', '--file', file],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_ACTIONS: '',
          SUPABASE_PROJECT_REF: REF,
          PREVIEW_SUPABASE_URL: env.supabaseUrl,
          PREVIEW_WEB_ORIGIN: env.webOrigin,
          PREVIEW_WEB_ORIGIN_WILDCARD: env.webOriginWildcard,
          GOOGLE_CLIENT_ID: '',
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /GOOGLE_CLIENT_ID/);
    assert.equal(readFileSync(file, 'utf8'), config);
  });
});

// The Supabase CLI of the repository validates offline (`config validate` never contacts the API
// and reads no .env without --resolve-env). Skipped where it is not installed.
const cli = path.join(root, 'node_modules/.bin/supabase');
// The npm shim exists even where the CLI binary was not downloaded (e.g. CI installs without
// the package's postinstall), so probe the binary itself.
const cliRuns = existsSync(cli) && spawnSync(cli, ['--version'], { encoding: 'utf8' }).status === 0;
describe(
  'Supabase CLI: config validate',
  { skip: !cliRuns && 'supabase CLI binary not available' },
  () => {
    const validate = (text) => {
      const workdir = mkdtempSync(path.join(tmp, 'validate-'));
      mkdirSync(path.join(workdir, 'supabase'));
      cpSync(path.join(root, 'supabase/functions'), path.join(workdir, 'supabase/functions'), {
        recursive: true,
      });
      writeFileSync(path.join(workdir, 'supabase/config.toml'), text);
      // In CI (CI, GITHUB_ACTIONS, …) the CLI prints a human summary instead of its JSON report;
      // a minimal environment keeps the JSON report everywhere.
      const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
      const result = spawnSync(cli, ['config', 'validate', '--workdir', workdir], {
        encoding: 'utf8',
        env,
      });
      return {
        status: result.status,
        report: JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))),
      };
    };

    test('the committed config is valid and names both cloud sections', () => {
      const { status, report } = validate(config);
      assert.equal(status, 0, JSON.stringify(report.errors));
      assert.deepEqual([...report.remotes].sort(), ['preview', 'production']);
    });

    test('the prepared copy is valid and has only the one cloud section', () => {
      const { status, report } = validate(prepareRemoteConfig(config, input('production')));
      assert.equal(status, 0, JSON.stringify(report.errors));
      assert.deepEqual(report.remotes, ['production']);
    });
  },
);
