// scripts/push-keys.mjs (spec 0013, Task 7): writes the web push keys and the shared secret only
// where they are missing, and never prints a value. Runs against throwaway files in a folder under
// tmp/ (git-ignored), never against the real .env; the folder is removed afterwards.
//
//   node --test scripts/push-keys.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createECDH } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts/push-keys.mjs');
mkdirSync(path.join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(path.join(root, 'tmp', 'push-keys-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const NAMES = [
  'EXPO_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'PUSH_SEND_SECRET',
];

let counter = 0;
function fileWith(content) {
  counter += 1;
  const file = path.join(dir, `env-${counter}`);
  if (content !== undefined) writeFileSync(file, content);
  return file;
}

function run(...args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** name → value of the file, like a dotenv parser (last value wins). */
function parse(file) {
  const values = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

function assertNoValueIn(output, values) {
  for (const name of NAMES) {
    const value = values[name];
    if (value) assert.ok(!output.includes(value), `output contains the value of ${name}`);
  }
}

test('writes the four names into a new file, valid and matching, without printing a value', () => {
  const file = fileWith(undefined);
  const { status, output } = run('--out', file);
  assert.equal(status, 0, output);
  const values = parse(file);
  for (const name of NAMES) assert.ok(values[name], `${name} written`);
  assertNoValueIn(output, values);
  for (const name of NAMES) assert.ok(output.includes(name), `output names ${name}`);

  const publicKey = Buffer.from(values.VAPID_PUBLIC_KEY, 'base64url');
  assert.equal(publicKey.length, 65);
  assert.equal(publicKey[0], 0x04);
  assert.equal(values.EXPO_PUBLIC_VAPID_PUBLIC_KEY, values.VAPID_PUBLIC_KEY);
  const privateKey = Buffer.from(values.VAPID_PRIVATE_KEY, 'base64url');
  assert.equal(privateKey.length, 32);
  // The private scalar belongs to the public point.
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(privateKey);
  assert.deepEqual(ecdh.getPublicKey(), publicKey);
  assert.match(values.PUSH_SEND_SECRET, /^[A-Za-z0-9_-]{43,}$/);
  assert.equal(statSync(file).mode & 0o077, 0, 'only the owner may read the file');
});

test('never overwrites a value that is already set', () => {
  const content = NAMES.map((name) => `${name}=keep-${name}`).join('\n') + '\nOTHER=1\n';
  const file = fileWith(content);
  const { status, output } = run('--out', file);
  assert.equal(status, 0, output);
  assert.equal(readFileSync(file, 'utf8'), content);
  assert.ok(!output.includes('keep-'));
});

test('fills empty placeholders (as copied from .env.example) in place, keeping everything else', () => {
  const content = [
    '# Supabase',
    'EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321',
    '# Web Push',
    'EXPO_PUBLIC_VAPID_PUBLIC_KEY=',
    'VAPID_PUBLIC_KEY=',
    'VAPID_PRIVATE_KEY=""',
    'PUSH_SEND_SECRET=',
    '',
  ].join('\n');
  const file = fileWith(content);
  const { status, output } = run('--out', file);
  assert.equal(status, 0, output);
  const lines = readFileSync(file, 'utf8').split('\n');
  assert.deepEqual(lines.slice(0, 3), content.split('\n').slice(0, 3));
  for (const name of NAMES) {
    const matching = lines.filter((line) => line.startsWith(`${name}=`));
    assert.equal(matching.length, 1, `${name} once`);
    assert.notEqual(matching[0], `${name}=`);
  }
  assert.equal(lines.indexOf(lines.find((line) => line.startsWith('PUSH_SEND_SECRET='))), 6);
  assertNoValueIn(output, parse(file));
});

test('keeps an existing secret and adds only the missing key pair', () => {
  const file = fileWith('PUSH_SEND_SECRET=keep-secret');
  const { status, output } = run('--out', file);
  assert.equal(status, 0, output);
  const values = parse(file);
  assert.equal(values.PUSH_SEND_SECRET, 'keep-secret');
  assert.ok(values.VAPID_PRIVATE_KEY && values.VAPID_PUBLIC_KEY);
  assertNoValueIn(output, values);
});

test('copies the public key into EXPO_PUBLIC_VAPID_PUBLIC_KEY when only that one is missing', () => {
  const file = fileWith('VAPID_PUBLIC_KEY=pub-value\nVAPID_PRIVATE_KEY=priv-value\n');
  const { status, output } = run('--out', file);
  assert.equal(status, 0, output);
  const values = parse(file);
  assert.equal(values.EXPO_PUBLIC_VAPID_PUBLIC_KEY, 'pub-value');
  assert.equal(values.VAPID_PRIVATE_KEY, 'priv-value');
  assert.ok(!output.includes('pub-value') && !output.includes('priv-value'));
});

test('refuses half a key pair and changes nothing', () => {
  for (const content of ['VAPID_PRIVATE_KEY=priv-value\n', 'VAPID_PUBLIC_KEY=pub-value\n']) {
    const file = fileWith(content);
    const { status, output } = run('--out', file);
    assert.equal(status, 1, output);
    assert.equal(readFileSync(file, 'utf8'), content);
    assert.ok(!output.includes('-value'));
  }
});

test('warns when the public keys differ, without printing them', () => {
  const file = fileWith(
    'EXPO_PUBLIC_VAPID_PUBLIC_KEY=pub-a\nVAPID_PUBLIC_KEY=pub-b\nVAPID_PRIVATE_KEY=priv\nPUSH_SEND_SECRET=s\n',
  );
  const { status, output } = run('--out', file);
  assert.equal(status, 0, output);
  assert.match(output, /EXPO_PUBLIC_VAPID_PUBLIC_KEY differs from VAPID_PUBLIC_KEY/);
  assert.ok(!output.includes('pub-a') && !output.includes('pub-b'));
});

test('rejects unknown arguments', () => {
  // Always with --out as well, so a parsing bug could never reach the real .env.
  const file = fileWith(undefined);
  assert.equal(run('--print', '--out', file).status, 2);
  assert.equal(run('--out', file, '--out').status, 2);
});
