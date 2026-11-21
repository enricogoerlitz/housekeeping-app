// Checks the finished web export (after finish-web-export.mjs) and fails the build when the
// protection the web session relies on is missing (ADR-0003: browser storage is acceptable only
// with no third-party scripts and a strict Content Security Policy):
// - index.html has the CSP <meta> with default-src 'self', script-src 'self' (only hashes besides,
//   nothing unsafe; script-src-elem and script-src-attr, when present, the same), object-src
//   'none', base-uri 'self' and connect-src with the Supabase origin of the build and no wildcard
//   or bare scheme (`*`, `https:` …);
// - index.html has no inline script (any <script> without a src attribute, in any letter case);
// - the service worker dist/sw.js exists (offline start, AC-004) and handles push and
//   notificationclick (spec 0013);
// - EXPO_PUBLIC_VAPID_PUBLIC_KEY is base64url of an uncompressed P-256 point (65 bytes, 0x04);
// - the values of VAPID_PRIVATE_KEY and PUSH_SEND_SECRET, when set in this process, appear in no
//   exported file (AC-046). Problems name the variable, never its value.
//
// Usage: node scripts/check-web-export.mjs [distDir]
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The CSP directives of the export's <meta>, or undefined when there is none. */
export function readCsp(html) {
  const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/i.exec(
    html,
  );
  if (!meta) return undefined;
  const directives = new Map();
  for (const part of (meta[1] ?? '').split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), values);
  }
  return directives;
}

/** Server-side secrets of push-send (ADR-0014) that must never reach the bundle. */
export const BUNDLE_SECRET_NAMES = ['VAPID_PRIVATE_KEY', 'PUSH_SEND_SECRET'];

/** Why the public VAPID key is unusable, or undefined when it is a 65-byte uncompressed point. */
function vapidKeyProblem(key) {
  if (!key)
    return 'EXPO_PUBLIC_VAPID_PUBLIC_KEY is not set (create it with node scripts/push-keys.mjs)';
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return 'EXPO_PUBLIC_VAPID_PUBLIC_KEY is not base64url';
  const bytes = Buffer.from(key, 'base64url');
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    return 'EXPO_PUBLIC_VAPID_PUBLIC_KEY is not an uncompressed P-256 public key (65 bytes)';
  }
  return undefined;
}

/**
 * Problems of the export; empty when it is fine. `files` ({path, content}) and `secrets`
 * ({name: value}) are optional: without them the secret scan is skipped.
 */
export function checkExport({
  html,
  serviceWorker,
  supabaseUrl,
  vapidPublicKey,
  files = [],
  secrets = {},
}) {
  const problems = [];
  if (!supabaseUrl) problems.push('EXPO_PUBLIC_SUPABASE_URL is not set');
  const vapid = vapidKeyProblem(vapidPublicKey);
  if (vapid) problems.push(vapid);
  const csp = readCsp(html);
  if (!csp) {
    problems.push('index.html has no Content-Security-Policy <meta>');
  } else {
    const values = (name) => csp.get(name) ?? [];
    if (values('default-src').join(' ') !== "'self'") {
      problems.push("default-src must be exactly 'self'");
    }
    if (!values('script-src').includes("'self'")) problems.push("script-src must contain 'self'");
    // script-src-elem and script-src-attr override script-src for their part, so they get the
    // same rule when the policy has them.
    for (const name of ['script-src', 'script-src-elem', 'script-src-attr']) {
      const foreign = values(name).filter(
        (value) => value !== "'self'" && !/^'sha256-[^']+'$/.test(value),
      );
      if (foreign.length > 0) {
        problems.push(`${name} allows more than 'self' and hashes: ${foreign.join(' ')}`);
      }
    }
    if (values('object-src').join(' ') !== "'none'") {
      problems.push("object-src must be exactly 'none'");
    }
    if (values('base-uri').join(' ') !== "'self'") {
      problems.push("base-uri must be exactly 'self'");
    }
    const connect = values('connect-src');
    if (supabaseUrl && !connect.includes(new URL(supabaseUrl).origin)) {
      problems.push('connect-src does not contain the Supabase origin');
    }
    const open = connect.filter((value) => value === '*' || /^[a-z][a-z0-9+.-]*:$/i.test(value));
    if (open.length > 0) {
      problems.push(`connect-src allows any host: ${open.join(' ')}`);
    }
  }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const external = /(?:^|\s)src\s*=/i.test(match[1] ?? '');
    if (!external && (match[2] ?? '').trim() !== '') {
      problems.push('index.html contains an inline script');
    }
  }
  if (serviceWorker === undefined) {
    problems.push('sw.js is missing');
  } else {
    for (const event of ['push', 'notificationclick']) {
      if (!new RegExp(`addEventListener\\(\\s*['"]${event}['"]`).test(serviceWorker)) {
        problems.push(`sw.js has no ${event} handler`);
      }
    }
  }
  for (const [name, value] of Object.entries(secrets)) {
    if (!value) continue;
    const needle = Buffer.from(value);
    if (files.some((file) => Buffer.from(file.content).includes(needle))) {
      problems.push(`the export contains the value of ${name}`);
    }
  }
  return problems;
}

/** Every file below `dir`, as {path, content}. */
function readTree(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return readTree(full, relative);
    return entry.isFile() ? [{ path: relative, content: readFileSync(full) }] : [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = path.resolve(appDir, process.argv[2] ?? 'dist');
  const swPath = path.join(dist, 'sw.js');
  const problems = checkExport({
    html: readFileSync(path.join(dist, 'index.html'), 'utf8'),
    serviceWorker: existsSync(swPath) ? readFileSync(swPath, 'utf8') : undefined,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim(),
    vapidPublicKey: process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY?.trim(),
    files: readTree(dist),
    secrets: Object.fromEntries(
      BUNDLE_SECRET_NAMES.map((name) => [name, process.env[name]?.trim()]),
    ),
  });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-web-export: ${problem}`);
    process.exit(1);
  }
  const scanned = BUNDLE_SECRET_NAMES.filter((name) => process.env[name]?.trim());
  console.log(
    `check-web-export: CSP, service worker with push and VAPID key are in place; secret scan: ${
      scanned.length > 0 ? scanned.join(', ') : 'no server secret in this environment'
    }.`,
  );
}
