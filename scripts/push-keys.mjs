// Creates the web push values (spec 0013, ADR-0014) and writes the ones that are missing into the
// root .env, or with --out into another file (e.g. `.env.production.push` for production). It
// never overwrites a value that is set and never prints a value, only names.
//
//   EXPO_PUBLIC_VAPID_PUBLIC_KEY  public VAPID key for the app build (the same as VAPID_PUBLIC_KEY)
//   VAPID_PUBLIC_KEY              base64url of the uncompressed P-256 point (65 bytes)
//   VAPID_PRIVATE_KEY             base64url of the private scalar d (32 bytes)
//   PUSH_SEND_SECRET              shared secret between the database (Vault) and push-send
//
// The key pair is created only when all three key names are missing; half a pair is refused,
// because a new private key would not match an existing public one. Run it yourself, once per
// environment; agents never run it against a real .env (rule 10-security).
//
//   node scripts/push-keys.mjs [--out <file>]
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_NAMES = ['EXPO_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'];
const SECRET_NAME = 'PUSH_SEND_SECRET';

function usage() {
  console.error('Usage: node scripts/push-keys.mjs [--out <file>]');
  process.exit(2);
}

function targetFile(args) {
  if (args.length === 0) return path.join(root, '.env');
  if (args.length === 2 && args[0] === '--out' && args[1] && !args[1].startsWith('--')) {
    return path.resolve(process.cwd(), args[1]);
  }
  return usage();
}

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/** The value of a dotenv line without quotes and comment; '' for a placeholder. */
function valueOf(rest) {
  const trimmed = rest.trim();
  const quoted = /^(['"])(.*)\1/.exec(trimmed);
  if (quoted) return quoted[2] ?? '';
  return trimmed.startsWith('#') ? '' : trimmed.replace(/\s+#.*$/, '');
}

/** Names with a value, and the line index of the first empty placeholder per name. */
function readEnv(lines) {
  const values = new Map();
  const placeholders = new Map();
  lines.forEach((line, index) => {
    const match = LINE.exec(line);
    if (!match) return;
    const [, name, rest] = match;
    const value = valueOf(rest ?? '');
    if (value) values.set(name, value);
    else if (!placeholders.has(name)) placeholders.set(name, index);
  });
  return { values, placeholders };
}

async function newKeyPair() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const raw = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKey = raw.toString('base64url');
  return { publicKey, privateKey: jwk.d };
}

const file = targetFile(process.argv.slice(2));
const original = existsSync(file) ? readFileSync(file, 'utf8') : '';
const lines = original === '' ? [] : original.split('\n');
const { values, placeholders } = readEnv(lines);
const has = (name) => values.has(name);

/** name → value to write. */
const additions = new Map();
const [expoName, publicName, privateName] = KEY_NAMES;
if (KEY_NAMES.every((name) => !has(name))) {
  const { publicKey, privateKey } = await newKeyPair();
  additions.set(expoName, publicKey);
  additions.set(publicName, publicKey);
  additions.set(privateName, privateKey);
} else if (!has(expoName) && has(publicName) && has(privateName)) {
  additions.set(expoName, values.get(publicName));
} else if (!has(publicName) || !has(privateName)) {
  const missing = KEY_NAMES.filter((name) => !has(name));
  console.error(
    `push-keys: ${path.relative(process.cwd(), file) || file} has only part of the VAPID key pair (missing: ${missing.join(', ')}). ` +
      'A new key would not match the existing one: remove all three key names (or set the missing ones yourself) and run again. Nothing was written.',
  );
  process.exit(1);
}
if (!has(SECRET_NAME)) {
  additions.set(SECRET_NAME, webcrypto.getRandomValues(Buffer.alloc(32)).toString('base64url'));
}

const shown = path.relative(process.cwd(), file) || file;
// An existing file readable by group or others is made owner-only, written or not.
if (existsSync(file) && (statSync(file).mode & 0o077) !== 0) {
  chmodSync(file, 0o600);
  console.warn(`push-keys: ${shown} was readable by group or others; set to 0600.`);
}
if (additions.size > 0) {
  const appended = [];
  for (const [name, value] of additions) {
    const index = placeholders.get(name);
    if (index === undefined) appended.push(`${name}=${value}`);
    else lines[index] = `${name}=${value}`;
  }
  if (appended.length > 0) {
    while (lines.length > 0 && lines.at(-1) === '') lines.pop();
    if (lines.length > 0) lines.push('');
    lines.push('# Web Push (node scripts/push-keys.mjs)', ...appended, '');
  }
  // Atomic: a temp file next to the target (owner-only from the start), then a rename, so an
  // interrupted run never leaves half a file. The result is always owner-only.
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    writeFileSync(temp, lines.join('\n'), { mode: 0o600, flag: 'wx' });
    chmodSync(temp, 0o600);
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
  console.log(
    `push-keys: wrote ${[...additions.keys()].join(', ')} to ${shown} (values not shown).`,
  );
}
const kept = [...KEY_NAMES, SECRET_NAME].filter((name) => !additions.has(name));
if (kept.length > 0) console.log(`push-keys: kept (already set) ${kept.join(', ')}.`);
if (has(expoName) && has(publicName) && values.get(expoName) !== values.get(publicName)) {
  console.warn(
    'push-keys: EXPO_PUBLIC_VAPID_PUBLIC_KEY differs from VAPID_PUBLIC_KEY; the app would subscribe with a key push-send does not sign with. Make them equal.',
  );
}
const ignored = spawnSync('git', ['check-ignore', '-q', file], { cwd: root });
if (ignored.status === 1) {
  console.warn(`push-keys: ${shown} is not git-ignored. Never commit it.`);
}
