// Finishes the static web export (`expo export --platform web` → dist/) for production:
// 1. Content Security Policy as <meta> in index.html (rule 10-security, ADR-0003). The Supabase
//    origin comes from EXPO_PUBLIC_SUPABASE_URL at build time; without it the build fails. An
//    inline script fails the build too, unless its hash is on INLINE_SCRIPT_ALLOWLIST.
// 2. Service worker dist/sw.js with the precache list (workbox-build injectManifest) and the
//    external registration script dist/register-sw.js (no inline script, so no CSP hash needed).
// 3. The Speech SDK's audio worklet as a same-origin file (it would otherwise use a blob: URL).
// 4. dist/version.json (spec 0014): the version from EXPO_PUBLIC_APP_VERSION (release `JJJJ.M.N`,
//    `vorschau` in the preview, `dev` when unset) and the commit from GITHUB_SHA (`local` when
//    unset). The app fetches it to notice a new release, so it is never precached (AC-023);
//    staticwebapp.config.json (from public/) is not precached either: Static Web Apps reads it
//    at deploy time, and one file it does not serve would fail the whole precache.
// Only the export gets these; the dev server stays without service worker and CSP.
// check-web-export.mjs then verifies the result (part of build:web).
//
// Usage: node scripts/finish-web-export.mjs [distDir]
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { injectManifest } from 'workbox-build';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(appDir, process.argv[2] ?? 'dist');
const indexPath = path.join(dist, 'index.html');

// ---------- 1. Content Security Policy ----------

function fail(message) {
  console.error(`finish-web-export: ${message}`);
  process.exit(1);
}

function supabaseOrigins() {
  const raw = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) fail('EXPO_PUBLIC_SUPABASE_URL is not set; the CSP needs the Supabase origin.');
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('EXPO_PUBLIC_SUPABASE_URL is not a URL.');
  }
  const socket = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
  return [url.origin, socket];
}

/**
 * Inline scripts that may run, as CSP hashes ('sha256-…'). Empty: the export has none today. An
 * entry needs a review of the script and a reason here; anything else fails the build instead of
 * being hashed automatically, so an injected script can never slip into the policy.
 */
const INLINE_SCRIPT_ALLOWLIST = [];

/** Hashes of the export's inline scripts; fails on one that is not on the allowlist. */
function inlineScriptHashes(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const body = match[1] ?? '';
    if (body.trim() === '') continue;
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    if (!INLINE_SCRIPT_ALLOWLIST.includes(hash)) {
      fail(`index.html has an inline script that is not allowlisted (${hash}).`);
    }
    hashes.push(hash);
  }
  return hashes;
}

/**
 * - style-src 'unsafe-inline': react-native-web writes its styles into a <style> element at
 *   runtime and the HTML template carries the expo-reset <style>; styles cannot run code.
 * - frame-ancestors is ignored in <meta>: the production server must send it as a header
 *   (`Content-Security-Policy: frame-ancestors 'none'`).
 */
function contentSecurityPolicy(html) {
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...inlineScriptHashes(html)],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    // Spec 0043: the recipe video, downloaded with the session, plays from a blob: URL.
    'media-src': ["'self'", 'blob:'],
    'font-src': ["'self'"],
    'connect-src': [
      "'self'",
      // Spec 0040, AC-015: "Aus diesem Foto" reads the shown photo from its blob: URL. Only this
      // page can create or read its blob: URLs, so this reaches no other host.
      'blob:',
      ...supabaseOrigins(),
      'https://*.stt.speech.microsoft.com',
      'wss://*.stt.speech.microsoft.com',
      'https://*.api.cognitive.microsoft.com',
    ],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

let html = readFileSync(indexPath, 'utf8');
if (html.includes('http-equiv="Content-Security-Policy"')) {
  throw new Error('finish-web-export: index.html already has a CSP; run it on a fresh export.');
}
const csp = contentSecurityPolicy(html);
// First in <head>, so it applies to everything after it.
html = html.replace(
  /<head>/,
  `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
);
html = html.replace('</body>', '<script src="/register-sw.js" defer></script>\n</body>');
writeFileSync(indexPath, html);

// ---------- 2. Service worker ----------

// Written first, so the globIgnores below have something to keep out of the precache.
writeFileSync(
  path.join(dist, 'version.json'),
  `${JSON.stringify({
    version: process.env.EXPO_PUBLIC_APP_VERSION?.trim() || 'dev',
    commit: process.env.GITHUB_SHA?.trim() || 'local',
  })}\n`,
);

writeFileSync(
  path.join(dist, 'register-sw.js'),
  `// Registers the service worker of the exported web app (see sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  });
}
`,
);

const { count, size, warnings } = await injectManifest({
  swSrc: path.join(appDir, 'scripts/sw-template.js'),
  swDest: path.join(dist, 'sw.js'),
  globDirectory: dist,
  globPatterns: [
    '**/*.{html,js,css,json,webmanifest,png,jpg,jpeg,webp,svg,ico,ttf,otf,woff,woff2}',
  ],
  globIgnores: [
    'sw.js',
    'register-sw.js',
    'metadata.json',
    'version.json',
    'staticwebapp.config.json',
    // Needed only for dictation, which needs the network anyway.
    '_expo/static/js/web/microsoft.cognitiveservices.speech-*.js',
    'speech-processor.js',
  ],
  // The common bundle is several MB; without it the app cannot start offline.
  maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
});
for (const warning of warnings) console.warn(`finish-web-export: ${warning}`);

// ---------- 3. Audio worklet of the Speech SDK ----------

const require = createRequire(import.meta.url);
const sdkDir = path.dirname(require.resolve('microsoft-cognitiveservices-speech-sdk/package.json'));
copyFileSync(
  path.join(sdkDir, 'distrib/lib/src/common.browser/speech-processor.js'),
  path.join(dist, 'speech-processor.js'),
);

console.log(
  `finish-web-export: CSP set, sw.js precaches ${count} files (${(size / 1024 / 1024).toFixed(1)} MB).`,
);
