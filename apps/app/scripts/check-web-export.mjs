// Checks the finished web export (after finish-web-export.mjs) and fails the build when the
// protection the web session relies on is missing (ADR-0003: browser storage is acceptable only
// with no third-party scripts and a strict Content Security Policy):
// - index.html has the CSP <meta> with default-src 'self', script-src 'self' (only hashes besides,
//   nothing unsafe; script-src-elem and script-src-attr, when present, the same), object-src
//   'none', base-uri 'self' and connect-src with the Supabase origin of the build and no wildcard
//   or bare scheme (`*`, `https:` …); in a build against a non-local Supabase, connect-src names
//   neither localhost nor 127.0.0.1 (spec 0014, AC-035);
// - index.html has no inline script (any <script> without a src attribute, in any letter case);
// - the service worker dist/sw.js exists (offline start, AC-004) and handles push and
//   notificationclick (spec 0013);
// - EXPO_PUBLIC_VAPID_PUBLIC_KEY is base64url of an uncompressed P-256 point (65 bytes, 0x04);
// - EXPO_PUBLIC_DEV_LOGIN=1 only with a local Supabase (spec 0014, AC-038);
// - staticwebapp.config.json (Azure Static Web Apps, spec 0014) sends the security headers and
//   the cache rules and falls back to index.html except for /_expo/* (AC-035 to AC-038);
// - version.json exists with a valid version and is not in the precache of sw.js (AC-023);
//   neither is staticwebapp.config.json (Static Web Apps reads it at deploy time; if it is not
//   served, the whole precache would fail);
// - the bundle contains no Supabase secret key, no service_role JWT, not the names of the
//   server secrets, and not the values of the server secrets set in this process (AC-046,
//   AC-061). Problems name the file and the variable, never the value.
//
// Usage: node scripts/check-web-export.mjs [distDir]
//        node scripts/check-web-export.mjs --scan <dir> [--names A,B,…]
//   --scan only runs the secret scan over <dir>, with the values of the named variables from the
//   environment (job "Pakete prüfen", spec 0014). A named variable that is not set fails the
//   scan, because it could not prove anything about that value.
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

/** Names of server secrets that have no business in the bundle, not even as a name (AC-061). */
const FORBIDDEN_NAMES = ['FOUNDRY_API_KEY', 'GOOGLE_CLIENT_SECRET'];

/** Same as LOCAL_HOSTS in packages/api/src/auth.ts. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function isLocalUrl(value) {
  try {
    return LOCAL_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

// ---------- Static Web Apps configuration ----------

/** Headers every page response must carry (AC-035); values compared exactly, HSTS by prefix. */
const SECURITY_HEADERS = [
  ['Content-Security-Policy', "frame-ancestors 'none'"],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['X-Robots-Tag', 'noindex'],
];
const NO_CACHE = 'no-cache';
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** A Static Web Apps route pattern as a RegExp: `*` matches anything, `{a,b}` one of a or b. */
function routePattern(route) {
  let source = '';
  for (let index = 0; index < route.length; index += 1) {
    const char = route[index];
    if (char === '*') source += '.*';
    else if (char === '{') {
      const end = route.indexOf('}', index);
      if (end < 0) return /$^/;
      source += `(?:${route
        .slice(index + 1, end)
        .split(',')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|')})`;
      index = end;
    } else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

/** Whether a route rule matches the path; `/x/index.html` also matches its folder `/x/`. */
function routeMatches(route, requestPath) {
  if (typeof route !== 'string') return false;
  if (routePattern(route).test(requestPath)) return true;
  return route.endsWith('/index.html') && requestPath === route.slice(0, -'index.html'.length);
}

/**
 * The headers Static Web Apps sends for a path (lower-case names): the global headers, overridden
 * by the first matching route (rules are evaluated in order, the first match wins). Responses of
 * the navigation fallback get no route rule at all (`fallback: true`). An empty value removes a
 * header.
 */
export function effectiveHeaders(config, requestPath, { fallback = false } = {}) {
  const headers = new Map();
  const add = (source) => {
    for (const [name, value] of Object.entries(source ?? {})) {
      if (value === '') headers.delete(name.toLowerCase());
      else headers.set(name.toLowerCase(), String(value));
    }
  };
  add(config.globalHeaders);
  if (!fallback) {
    const rule = (Array.isArray(config.routes) ? config.routes : []).find((candidate) =>
      routeMatches(candidate?.route, requestPath),
    );
    add(rule?.headers);
  }
  return headers;
}

/** Problems of the parsed staticwebapp.config.json; empty when it is complete. */
export function staticWebAppConfigProblems(config) {
  const problems = [];
  const pages = [
    ['/', {}],
    ['/index.html', {}],
    // A deep link (/rezept/<id>) is answered by the navigation fallback.
    ['/rezept/beispiel', { fallback: true }],
  ];
  for (const [requestPath, options] of pages) {
    const headers = effectiveHeaders(config, requestPath, options);
    for (const [name, value] of SECURITY_HEADERS) {
      const actual = headers.get(name.toLowerCase());
      const ok =
        name === 'Strict-Transport-Security'
          ? /^max-age=[1-9]\d*/.test(actual ?? '')
          : actual === value;
      if (!ok) problems.push(`${requestPath} does not send ${name}: ${value}`);
    }
  }
  const cacheRules = [
    ['/', NO_CACHE, {}],
    ['/index.html', NO_CACHE, {}],
    ['/sw.js', NO_CACHE, {}],
    ['/register-sw.js', NO_CACHE, {}],
    ['/version.json', NO_CACHE, {}],
    // Without no-cache here, a deep link could get a stale index.html whose bundles are gone.
    ['/rezept/beispiel', NO_CACHE, { fallback: true }],
    ['/_expo/static/js/web/entry-0123456789abcdef.js', IMMUTABLE, {}],
  ];
  for (const [requestPath, value, options] of cacheRules) {
    if (effectiveHeaders(config, requestPath, options).get('cache-control') !== value) {
      problems.push(`${requestPath} does not send Cache-Control: ${value}`);
    }
  }
  const fallback = config.navigationFallback;
  if (fallback?.rewrite !== '/index.html') {
    problems.push('navigationFallback does not rewrite to /index.html');
  } else if (!Array.isArray(fallback.exclude) || !fallback.exclude.includes('/_expo/*')) {
    problems.push('navigationFallback does not exclude /_expo/*');
  }
  return problems;
}

/** The URLs in the precache list of sw.js (workbox-build writes them as JSON). */
export function precachedUrls(serviceWorker) {
  return [...serviceWorker.matchAll(/"url"\s*:\s*"([^"]+)"/g)].map((match) => match[1]);
}

/** Files that must never be precached: always fetched fresh, or not served as a file. */
const NEVER_PRECACHED = ['version.json', 'staticwebapp.config.json'];

/** Valid versions in version.json: a release `JJJJ.M.N`, the preview, or a local build. */
const VERSION = /^(?:dev|vorschau|\d{4}\.(?:1[0-2]|[1-9])\.[1-9]\d*)$/;

function versionFileProblems(text) {
  if (text === undefined) return ['version.json is missing'];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return ['version.json is not valid JSON'];
  }
  const problems = [];
  if (typeof parsed?.version !== 'string' || !VERSION.test(parsed.version)) {
    problems.push('version.json has no valid version (JJJJ.M.N, vorschau or dev)');
  }
  if (typeof parsed?.commit !== 'string' || parsed.commit === '') {
    problems.push('version.json has no commit');
  }
  return problems;
}

// ---------- Secret scan ----------

const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{20,}/;
const JWT = /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/g;

function hasServiceRoleJwt(text) {
  for (const match of text.matchAll(JWT)) {
    const payload = Buffer.from(match[1] ?? '', 'base64url').toString('utf8');
    if (/"role"\s*:\s*"service_role"/.test(payload)) return true;
  }
  return false;
}

/**
 * Secrets in the files ({path, content}): a whole Supabase secret key, a JWT with the role
 * service_role, the names of server secrets, and the values of `secrets` ({name: value}; empty
 * values are skipped). The bare word "sb_secret_" is no finding: supabase-js checks key prefixes
 * with it. Problems name file and kind or variable, never the value.
 */
export function scanFiles(files, secrets = {}) {
  const problems = [];
  const values = Object.entries(secrets).filter(([, value]) => value);
  for (const file of files) {
    const content = Buffer.from(file.content);
    const text = content.toString('latin1');
    if (SECRET_KEY.test(text)) {
      problems.push(`${file.path} contains a Supabase secret key (sb_secret_…)`);
    }
    if (hasServiceRoleJwt(text)) problems.push(`${file.path} contains a service_role JWT`);
    for (const name of FORBIDDEN_NAMES) {
      if (text.includes(name)) problems.push(`${file.path} contains the name ${name}`);
    }
    for (const [name, value] of values) {
      if (content.includes(Buffer.from(value))) {
        problems.push(`${file.path} contains the value of ${name}`);
      }
    }
  }
  return problems;
}

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
 * Problems of the export; empty when it is fine. `swaConfig` and `versionFile` are the texts of
 * the files (undefined when missing). `files` ({path, content}) and `secrets` ({name: value}) are
 * optional: without them the secret scan is skipped.
 */
export function checkExport({
  html,
  serviceWorker,
  supabaseUrl,
  vapidPublicKey,
  devLogin,
  swaConfig,
  versionFile,
  files = [],
  secrets = {},
}) {
  const problems = [];
  if (!supabaseUrl) problems.push('EXPO_PUBLIC_SUPABASE_URL is not set');
  const localBuild = supabaseUrl !== undefined && isLocalUrl(supabaseUrl);
  if (devLogin === '1' && !localBuild) {
    problems.push('EXPO_PUBLIC_DEV_LOGIN=1 is only allowed with a local Supabase');
  }
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
    if (supabaseUrl && !localBuild) {
      for (const value of connect.filter(isLocalUrl)) {
        problems.push(`connect-src names a local address (${value}) in a non-local build`);
      }
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
    const precached = precachedUrls(serviceWorker);
    for (const name of NEVER_PRECACHED) {
      if (precached.includes(name)) problems.push(`sw.js precaches ${name}`);
    }
  }
  if (swaConfig === undefined) {
    problems.push('staticwebapp.config.json is missing');
  } else {
    let config;
    try {
      config = JSON.parse(swaConfig);
    } catch {
      problems.push('staticwebapp.config.json is not valid JSON');
    }
    if (config !== undefined) {
      for (const problem of staticWebAppConfigProblems(config)) {
        problems.push(`staticwebapp.config.json: ${problem}`);
      }
    }
  }
  problems.push(...versionFileProblems(versionFile));
  problems.push(...scanFiles(files, secrets));
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

function readIfExists(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

function report(problems) {
  if (problems.length === 0) return;
  for (const problem of problems) console.error(`check-web-export: ${problem}`);
  process.exit(1);
}

/** `--scan <dir> [--names A,B]`: only the secret scan (job "Pakete prüfen"). */
function scanMode(args) {
  const dirArg = args[1];
  const namesAt = args.indexOf('--names');
  const names =
    namesAt < 0
      ? []
      : (args[namesAt + 1] ?? '')
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean);
  if (!dirArg || dirArg.startsWith('--') || (namesAt >= 0 && names.length === 0)) {
    console.error('Usage: node scripts/check-web-export.mjs --scan <dir> [--names A,B,…]');
    process.exit(2);
  }
  const dir = path.resolve(dirArg);
  if (!existsSync(dir)) report([`${dirArg} does not exist`]);
  report(names.filter((name) => !process.env[name]?.trim()).map((name) => `${name} is not set`));
  report(
    scanFiles(
      readTree(dir),
      Object.fromEntries(names.map((name) => [name, process.env[name]?.trim()])),
    ),
  );
  console.log(
    `check-web-export: no secret in ${dirArg} (patterns${names.length > 0 ? `, values of ${names.join(', ')}` : ''}).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--scan') {
    scanMode(args);
  } else {
    const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const dist = path.resolve(appDir, args[0] ?? 'dist');
    report(
      checkExport({
        html: readFileSync(path.join(dist, 'index.html'), 'utf8'),
        serviceWorker: readIfExists(path.join(dist, 'sw.js')),
        supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim(),
        vapidPublicKey: process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY?.trim(),
        devLogin: process.env.EXPO_PUBLIC_DEV_LOGIN?.trim(),
        swaConfig: readIfExists(path.join(dist, 'staticwebapp.config.json')),
        versionFile: readIfExists(path.join(dist, 'version.json')),
        files: readTree(dist),
        secrets: Object.fromEntries(
          BUNDLE_SECRET_NAMES.map((name) => [name, process.env[name]?.trim()]),
        ),
      }),
    );
    const scanned = BUNDLE_SECRET_NAMES.filter((name) => process.env[name]?.trim());
    console.log(
      `check-web-export: CSP, service worker with push, VAPID key, Static Web Apps configuration and version.json are in place; secret scan: patterns${
        scanned.length > 0 ? `, values of ${scanned.join(', ')}` : ''
      }.`,
    );
  }
}
