// Checks the finished web export (after finish-web-export.mjs) and fails the build when the
// protection the web session relies on is missing (ADR-0003: browser storage is acceptable only
// with no third-party scripts and a strict Content Security Policy):
// - index.html has the CSP <meta> with default-src 'self', script-src 'self' (only hashes besides,
//   nothing unsafe), object-src 'none' and connect-src with the Supabase origin of the build;
// - index.html has no inline script;
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
    const script = values('script-src');
    if (!script.includes("'self'")) problems.push("script-src must contain 'self'");
    const foreign = script.filter((value) => value !== "'self'" && !/^'sha256-[^']+'$/.test(value));
    if (foreign.length > 0) {
      problems.push(`script-src allows more than 'self' and hashes: ${foreign.join(' ')}`);
    }
    if (values('object-src').join(' ') !== "'none'") {
      problems.push("object-src must be exactly 'none'");
    }
    if (supabaseUrl && !values('connect-src').includes(new URL(supabaseUrl).origin)) {
      problems.push('connect-src does not contain the Supabase origin');
    }
  }
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if ((match[1] ?? '').trim() !== '') problems.push('index.html contains an inline script');
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
