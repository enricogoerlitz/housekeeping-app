// .gitleaks.toml (spec 0014, Task 1): the check "Geheimnisse" runs gitleaks over the commits of a
// pull request. This test runs the same command against a throwaway repository under tmp/
// (git-ignored). It needs `gitleaks` on the PATH and is skipped without it; in the workflow it
// always runs. The fake secrets are assembled at run time, so this file itself holds none.
//
//   node --test scripts/ci/secrets.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = path.join(root, '.gitleaks.toml');
const installed = spawnSync('gitleaks', ['version'], { encoding: 'utf8' }).status === 0;
const skip = installed
  ? false
  : 'gitleaks is not installed; the workflow job "Geheimnisse" runs it';

mkdirSync(path.join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(path.join(root, 'tmp', 'secrets-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const randomish = (length) =>
  Array.from({ length }, (_, i) => 'Kq7Zr2Lm9XwB4tYp'[(i * 7 + 3) % 16]).join('');

/** Fake values per file, each shaped like one of the four kinds the spec names (AC-008). */
const LEAKS = {
  'supabase.env': `SUPABASE_SECRET_KEY=${['sb', 'secret', randomish(32)].join('_')}\n`,
  'service.ts': `export const key = '${[
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ iss: 'supabase', ref: 'abcdefghijklmnop', role: ['service', 'role'].join('_'), iat: 1 }),
    randomish(43),
  ].join('.')}';\n`,
  'azure.txt': `DefaultEndpointsProtocol=https;AccountName=sthousekeeping;Account${'Key'}=${randomish(86)}==;EndpointSuffix=core.windows.net\n`,
  'deploy.pem': `${['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ')}\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7${randomish(40)}\n${['-----END', 'PRIVATE', 'KEY-----'].join(' ')}\n`,
};

const git = (cwd, ...args) => {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
    { cwd, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

let counter = 0;
/** A repository with a clean first commit and a second commit adding `files`; returns both. */
function repoWith(files) {
  counter += 1;
  const cwd = path.join(dir, `repo-${counter}`);
  mkdirSync(cwd, { recursive: true });
  git(cwd, 'init', '-q');
  copyFileSync(config, path.join(cwd, '.gitleaks.toml'));
  writeFileSync(path.join(cwd, 'README.md'), '# test\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-q', '-m', 'chore: start');
  const base = git(cwd, 'rev-parse', 'HEAD');
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), text);
  }
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-q', '-m', 'feat: x');
  return { cwd, base };
}

/** The command of the workflow job "Geheimnisse". */
function gitleaks(cwd, base) {
  const result = spawnSync(
    'gitleaks',
    [
      'git',
      '--no-banner',
      '--no-color',
      '--redact',
      '--verbose',
      '--ignore-gitleaks-allow',
      '--config',
      path.join(cwd, '.gitleaks.toml'),
      `--log-opts=${base}..HEAD`,
      cwd,
    ],
    { cwd, encoding: 'utf8' },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test(
  'AC-008: every kind of secret is red with file and line, never with the value',
  { skip },
  () => {
    const { cwd, base } = repoWith(LEAKS);
    const { status, output } = gitleaks(cwd, base);
    assert.equal(status, 1, output);
    for (const [file, text] of Object.entries(LEAKS)) {
      assert.match(
        output,
        new RegExp(`File:\\s+${file.replace('.', '\\.')}`),
        `${file}\n${output}`,
      );
      for (const line of text.split('\n').filter(Boolean)) {
        for (const part of line.split(/[=' ;]/).filter((p) => p.length >= 24)) {
          assert.ok(!output.includes(part), `value of ${file} in the output`);
        }
      }
    }
    assert.match(output, /Line:\s+\d+/);
  },
);

test('AC-008: a gitleaks:allow comment does not hide a secret', { skip }, () => {
  const value = ['sb', 'secret', randomish(30)].join('_');
  const { cwd, base } = repoWith({ 'x.ts': `const k = '${value}'; // gitleaks:allow\n` });
  const { status, output } = gitleaks(cwd, base);
  assert.equal(status, 1, output);
  assert.ok(!output.includes(value));
});

test('the public local publishable key in .env.example and checks.yml is allowed', { skip }, () => {
  const key = ['sb', 'publishable', 'ACJWlzQHlZjBrEguHvfOxg', '3BJgxAaH'].join('_');
  const { cwd, base } = repoWith({
    '.env.example': `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\n`,
    '.github/workflows/checks.yml': `env:\n  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${key}\n`,
  });
  const { status, output } = gitleaks(cwd, base);
  assert.equal(status, 0, output);
});
