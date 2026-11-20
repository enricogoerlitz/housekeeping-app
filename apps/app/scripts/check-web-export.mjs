// Checks the finished web export (after finish-web-export.mjs) and fails the build when the
// protection the web session relies on is missing (ADR-0003: browser storage is acceptable only
// with no third-party scripts and a strict Content Security Policy):
// - index.html has the CSP <meta> with default-src 'self', script-src 'self' (only hashes besides,
//   nothing unsafe; script-src-elem and script-src-attr, when present, the same), object-src
//   'none', base-uri 'self' and connect-src with the Supabase origin of the build and no wildcard
//   or bare scheme (`*`, `https:` …);
// - index.html has no inline script (any <script> without a src attribute, in any letter case);
// - the service worker dist/sw.js exists (offline start, AC-004).
//
// Usage: node scripts/check-web-export.mjs [distDir]
import { existsSync, readFileSync } from 'node:fs';
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

/** Problems of the export; empty when it is fine. */
export function checkExport({ html, hasServiceWorker, supabaseUrl }) {
  const problems = [];
  if (!supabaseUrl) problems.push('EXPO_PUBLIC_SUPABASE_URL is not set');
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
  if (!hasServiceWorker) problems.push('sw.js is missing');
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = path.resolve(appDir, process.argv[2] ?? 'dist');
  const problems = checkExport({
    html: readFileSync(path.join(dist, 'index.html'), 'utf8'),
    hasServiceWorker: existsSync(path.join(dist, 'sw.js')),
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim(),
  });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-web-export: ${problem}`);
    process.exit(1);
  }
  console.log('check-web-export: CSP and service worker are in place.');
}
