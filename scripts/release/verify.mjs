// Verification after a delivery (spec 0014, Task 6; plan decision 22). Asks the delivered web app
// and its Supabase project from outside, and reads the database only through
// `supabase db query --read-only`. No dependencies: runs in a job with an environment, which
// installs no packages (Supabase CLI from supabase/setup-cli, SUPABASE_ACCESS_TOKEN set).
//
//   SUPABASE_PUBLISHABLE_KEY=… SUPABASE_ACCESS_TOKEN=… \
//     node scripts/release/verify.mjs <web-origin> <supabase-url> \
//       [--environment production|preview] [--version <JJJJ.M.N>] [--commit <sha>]
//       [--old-origin <https://….azurestaticapps.net>]
//
// Checks, each reported as `ok` or `FEHLER` with a reason, never with values from the answers:
// - Kopfzeilen (AC-035): CSP frame-ancestors 'none', nosniff, Referrer-Policy, HSTS, noindex on
//   / and /index.html; CSP der App (AC-035, AC-013): connect-src names this Supabase project and
//   no other and no local address;
// - Cache-Regeln (AC-036), Tiefe Links (AC-037), version.json (AC-069 with --commit, the
//   delivered version with --version);
// - Auth-Einstellungen (AC-041): /auth/v1/settings with email, phone and anonymous sign-in off and
//   Google on;
// - Functions (AC-044): every function of supabase/functions without authorization, from the web
//   origin and from a foreign origin → 401 or 403;
// - REST ohne net, GraphQL ohne net (AC-073): PGRST106 for the schema net; GraphQL as anon over
//   /graphql/v1 and as authenticated in the database (set_config role and the search path of the
//   API, read-only) names nothing of net;
// - Keine Seed-Daten (AC-042): no account on @example.com, no household or account with an id of
//   supabase/seed.sql (preview: its demo households are expected, so only @example.com counts);
// - Foto-Bucket, Foto ohne Anmeldung (AC-046);
// - Konfiguration (AC-040, AC-073 „Exposed schemas“): `supabase config diff --exit-code`;
// - Alte Adresse (spec 0027, AC-042, AC-043; with --old-origin): the azurestaticapps.net address
//   answers /kalender with 301 or 308 to the same path on the web origin.
// The project of the database checks is the one in the Supabase address (`--remote=<ref>`).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { readCsp } from '../../apps/app/scripts/check-web-export.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The foreign origin of AC-044 (reserved, never resolves to anyone). */
export const FOREIGN_ORIGIN = 'https://fremd.example.invalid';
const DEEP_LINK = '/rezept/00000000-0000-4000-8000-000000000000';
const MISSING_FILE = '/_expo/static/js/web/gibt-es-nicht.js';
const NO_CACHE = ['/index.html', '/sw.js', '/register-sw.js', '/version.json'];
const IMMUTABLE = ['public', 'max-age=31536000', 'immutable'];
const BUCKET = 'household-media';
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const VIDEO_BUCKET = 'household-videos';
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
/** Names from net (pg_net) that must never show up in GraphQL, compared without case and `_`. */
const NET_NAMES = ['http_request_queue', '_http_response', 'http_post', 'http_get', 'http_delete'];
const INTROSPECTION = '{ __schema { types { name fields { name } } } }';
const PROBE = '{ http_request_queueCollection { __typename } }';

const result = (name, problems, okDetail) =>
  problems.length === 0
    ? { name, ok: true, detail: okDetail }
    : { name, ok: false, detail: problems.join('; ') };

const header = (response, name) => response?.headers?.[name.toLowerCase()] ?? '';
const tokens = (value) =>
  value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
const unreachable = (response) =>
  response?.error !== undefined ? `nicht erreichbar (${response.error})` : undefined;

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** AC-035: the security headers of / and /index.html. */
export function checkSecurityHeaders(responses) {
  const problems = [];
  for (const [where, response] of Object.entries(responses)) {
    const down = unreachable(response);
    if (down) {
      problems.push(`${where}: ${down}`);
      continue;
    }
    if (response.status !== 200) problems.push(`${where}: HTTP ${response.status}`);
    if (!header(response, 'content-security-policy').includes("frame-ancestors 'none'")) {
      problems.push(`${where}: Content-Security-Policy ohne frame-ancestors 'none'`);
    }
    if (header(response, 'x-content-type-options').trim() !== 'nosniff') {
      problems.push(`${where}: X-Content-Type-Options ist nicht nosniff`);
    }
    if (header(response, 'referrer-policy').trim() !== 'strict-origin-when-cross-origin') {
      problems.push(`${where}: Referrer-Policy ist nicht strict-origin-when-cross-origin`);
    }
    if (!/max-age=[1-9]\d*/.test(header(response, 'strict-transport-security'))) {
      problems.push(`${where}: Strict-Transport-Security fehlt`);
    }
    if (!tokens(header(response, 'x-robots-tag')).includes('noindex')) {
      problems.push(`${where}: X-Robots-Tag ohne noindex`);
    }
  }
  return result('Kopfzeilen', problems, 'Sicherheits-Header auf / und /index.html');
}

/** Spec 0027, AC-042, AC-043: the old default address leads to the own domain. */
export function checkOldOrigin(response, webOrigin, oldOrigin) {
  const name = 'Alte Adresse';
  if (!oldOrigin) return result(name, ['Alte Adresse nicht angegeben (--old-origin)']);
  const down = unreachable(response);
  if (down) return result(name, [down]);
  const target = `${webOrigin.replace(/\/+$/, '')}/kalender`;
  if (response.status === 200) return result(name, ['Alte Adresse leitet nicht um']);
  if (![301, 308].includes(response.status)) {
    return result(name, [`HTTP ${response.status} statt 301 oder 308`]);
  }
  if (header(response, 'location') !== target) {
    return result(name, ['leitet nicht auf dieselbe Seite der eigenen Domain um']);
  }
  return result(name, [], 'leitet dauerhaft auf die eigene Domain um');
}

const hostOf = (source) => /^[a-z][a-z0-9+.-]*:\/\/([^/:]+)/i.exec(source)?.[1]?.toLowerCase();

/** AC-035, AC-013: connect-src of the app names this Supabase project only. */
export function checkAppCsp(html, supabaseUrl) {
  const directives = typeof html === 'string' ? readCsp(html) : undefined;
  if (!directives) return result('CSP der App', ['index.html hat kein CSP-Meta-Tag']);
  const own = new URL(supabaseUrl).host.toLowerCase();
  const connect = directives.get('connect-src') ?? [];
  const problems = [];
  if (!connect.some((source) => hostOf(source) === own && source.startsWith('https://'))) {
    problems.push('connect-src nennt das Supabase-Projekt dieser Umgebung nicht');
  }
  if (connect.some((source) => LOCAL_HOSTS.has(hostOf(source)))) {
    problems.push('connect-src nennt eine lokale Adresse (localhost oder 127.0.0.1)');
  }
  if (connect.some((source) => hostOf(source)?.includes('supabase') && hostOf(source) !== own)) {
    problems.push('connect-src nennt ein anderes Supabase-Projekt');
  }
  return result('CSP der App', problems, 'connect-src nennt nur dieses Supabase-Projekt');
}

/** AC-036: no-cache for the entry files, immutable for the hashed bundle under /_expo/static/. */
export function checkCacheRules(responses, entry) {
  const problems = [];
  for (const where of NO_CACHE) {
    const response = responses[where];
    const down = unreachable(response);
    if (down) problems.push(`${where}: ${down}`);
    else if (response.status !== 200) problems.push(`${where}: HTTP ${response.status}`);
    else if (!tokens(header(response, 'cache-control')).includes('no-cache')) {
      problems.push(`${where}: Cache-Control ohne no-cache`);
    }
  }
  if (!entry) {
    problems.push('index.html nennt keine Datei unter /_expo/static/');
  } else {
    const response = responses[entry];
    const cache = tokens(header(response, 'cache-control'));
    if (unreachable(response) || response.status !== 200) {
      problems.push(`/_expo/static/…: ${unreachable(response) ?? `HTTP ${response.status}`}`);
    } else if (!IMMUTABLE.every((token) => cache.includes(token))) {
      problems.push('/_expo/static/…: Cache-Control ist nicht public, max-age=31536000, immutable');
    }
  }
  return result(
    'Cache-Regeln',
    problems,
    'no-cache für die Einstiegsdateien, immutable für /_expo/static/',
  );
}

/** AC-037: a deep link answers with the app, a missing bundle file with 404 and not the app. */
export function checkDeepLinks({ deep, missing }, entry) {
  const marker = entry ?? '<div id="root"';
  const problems = [];
  if (unreachable(deep) || deep.status !== 200 || !deep.body.includes(marker)) {
    problems.push(
      `/rezept/<id>: ${unreachable(deep) ?? `HTTP ${deep.status}`}, erwartet 200 mit der App`,
    );
  }
  if (unreachable(missing) || missing.status !== 404 || missing.body.includes(marker)) {
    problems.push(
      `${MISSING_FILE}: ${unreachable(missing) ?? `HTTP ${missing.status}`}, erwartet 404 ohne die App`,
    );
  }
  return result('Tiefe Links', problems, 'tiefer Link liefert die App, fehlende Datei 404');
}

/** /version.json is valid, and names the expected version and commit when given. */
export function checkVersionFile(response, { version, commit }) {
  const down = unreachable(response);
  if (down) return result('version.json', [down]);
  const data = response.status === 200 ? parseJson(response.body) : undefined;
  if (typeof data?.version !== 'string' || typeof data?.commit !== 'string') {
    return result('version.json', [`HTTP ${response.status}, keine Versionsdatei`]);
  }
  const problems = [];
  if (version && data.version !== version) problems.push(`nennt nicht die Version ${version}`);
  if (commit && data.commit !== commit) problems.push(`nennt nicht den Commit ${commit}`);
  return result('version.json', problems, `Version ${data.version}`);
}

/** AC-041 (AC-040): email, phone and anonymous sign-in off, Google on. */
export function checkAuthSettings(response) {
  const down = unreachable(response);
  if (down) return result('Auth-Einstellungen', [down]);
  const external = response.status === 200 ? parseJson(response.body)?.external : undefined;
  if (!external || typeof external !== 'object') {
    return result('Auth-Einstellungen', [`/auth/v1/settings: HTTP ${response.status}`]);
  }
  const problems = [];
  for (const flag of ['email', 'phone']) {
    if (external[flag] !== false) problems.push(`${flag} ist nicht false`);
  }
  if (external.anonymous_users === true) problems.push('anonymous_users ist true');
  if (external.google !== true) problems.push('google ist nicht true');
  return result('Auth-Einstellungen', problems, 'email: false, phone: false, google: true');
}

/** AC-044: every call without authorization is refused with 401 or 403. */
export function checkFunctions(calls) {
  if (calls.length === 0) return result('Functions', ['keine Function im Repo gefunden']);
  const problems = calls
    .filter(({ response }) => ![401, 403].includes(response?.status))
    .map(
      ({ name, origin, response }) =>
        `${name} von ${origin}r Herkunft: ${unreachable(response) ?? `HTTP ${response.status}`}, erwartet 401 oder 403`,
    );
  const names = new Set(calls.map((call) => call.name)).size;
  return result(
    'Functions',
    problems,
    `${names} Function(s) lehnen ohne Berechtigung ab, von eigener und fremder Herkunft`,
  );
}

/** AC-073: PostgREST refuses the schema net with 406 PGRST106. */
export function checkNetRest({ rpc, table }) {
  const problems = [];
  for (const [where, response] of [
    ['/rest/v1/rpc/http_post (Content-Profile: net)', rpc],
    ['/rest/v1/http_request_queue (Accept-Profile: net)', table],
  ]) {
    const code = parseJson(response?.body ?? '')?.code;
    if (unreachable(response) || response.status !== 406 || code !== 'PGRST106') {
      problems.push(
        `${where}: ${unreachable(response) ?? `HTTP ${response.status}`}, erwartet 406 PGRST106`,
      );
    }
  }
  return result('REST ohne net', problems, 'PGRST106 für net');
}

const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const NET_NORMALIZED = NET_NAMES.map((name) => [name, normalize(name)]);
const messages = (answer) =>
  Array.isArray(answer?.errors) ? answer.errors.map((e) => String(e?.message ?? '')) : [];
const disabled = (answer) =>
  messages(answer).some((m) => m.includes('pg_graphql extension is not enabled'));
const unknownField = (answer, field) =>
  messages(answer).some((m) => m.includes(`Unknown field "${field}"`));

/** AC-073: GraphQL as `role` names nothing of net, and the queue cannot be queried. */
export function checkGraphql(role, { introspection, probe }) {
  const name = `GraphQL ohne net (${role})`;
  if (disabled(introspection) && disabled(probe)) return result(name, [], 'pg_graphql ist aus');
  const problems = [];
  let note = 'Introspektion ohne net';
  const types = introspection?.data?.__schema?.types;
  if (Array.isArray(types)) {
    const names = types.flatMap((type) => [
      type?.name,
      ...(Array.isArray(type?.fields) ? type.fields.map((field) => field?.name) : []),
    ]);
    const found = NET_NORMALIZED.filter(([, bare]) =>
      names.some((n) => typeof n === 'string' && normalize(n).includes(bare)),
    ).map(([original]) => original);
    if (found.length > 0)
      problems.push(`Introspektion als ${role} nennt ${found.join(', ')} aus net`);
  } else if (unknownField(introspection, '__schema')) {
    note = 'Introspektion abgeschaltet';
  } else {
    problems.push('Introspektion ohne verwertbare Antwort');
  }
  if (probe?.data?.http_request_queueCollection !== undefined) {
    problems.push('http_request_queueCollection ist abfragbar');
  } else if (!unknownField(probe, 'http_request_queueCollection') && !disabled(probe)) {
    problems.push('Abfrage von http_request_queueCollection ohne erwartete Ablehnung');
  }
  return result(name, problems, `${note}, Warteschlange nicht abfragbar`);
}

/** AC-042: no @example.com account and (production) no household or account of the seed. */
export function checkSeedData(row, environment) {
  const count = (key) => Number(row?.[key] ?? Number.NaN);
  const problems = [];
  const checks = [['example_accounts', 'Konto(en) auf @example.com']];
  if (environment === 'production') {
    checks.push(
      ['seed_households', 'Haushalt(e) aus dem Seed'],
      ['seed_accounts', 'Konto(en) mit einer Seed-ID'],
    );
  }
  for (const [key, label] of checks) {
    const n = count(key);
    if (!Number.isFinite(n)) problems.push(`${label}: nicht gezählt`);
    else if (n > 0) problems.push(`${n} ${label}`);
  }
  return result(
    'Keine Seed-Daten',
    problems,
    environment === 'production'
      ? 'keine @example.com-Konten, keine Seed-IDs'
      : 'keine @example.com-Konten',
  );
}

/**
 * Spec 0043: the video bucket is private, takes at most 50 MiB and only video/mp4. Missing is red:
 * the app needs it, and since spec 0048 no backup reads it, so a lost bucket shows up only here.
 */
export function checkVideoBucket(bucket) {
  if (!bucket) return result('Video-Bucket', [`Bucket ${VIDEO_BUCKET} fehlt`]);
  const problems = [];
  if (bucket.public !== false) problems.push('ist öffentlich');
  if (Number(bucket.file_size_limit) !== MAX_VIDEO_BYTES)
    problems.push('nimmt nicht höchstens 50 MiB an');
  const types = bucket.allowed_mime_types;
  if (!Array.isArray(types) || types.length !== 1 || types[0] !== 'video/mp4') {
    problems.push('nimmt nicht nur video/mp4 an');
  }
  return result('Video-Bucket', problems, 'privat, höchstens 50 MiB, nur video/mp4');
}

/** AC-046: the photo bucket is private, takes at most 2 MiB and only image/jpeg. */
export function checkPhotoBucket(bucket) {
  if (!bucket) return result('Foto-Bucket', [`Bucket ${BUCKET} fehlt`]);
  const problems = [];
  if (bucket.public !== false) problems.push('ist öffentlich');
  if (Number(bucket.file_size_limit) !== MAX_PHOTO_BYTES)
    problems.push('nimmt nicht höchstens 2 MiB an');
  const types = bucket.allowed_mime_types;
  if (!Array.isArray(types) || types.length !== 1 || types[0] !== 'image/jpeg') {
    problems.push('nimmt nicht nur image/jpeg an');
  }
  return result('Foto-Bucket', problems, 'privat, höchstens 2 MiB, nur image/jpeg');
}

/** AC-046: a photo cannot be fetched without sign-in (undefined: there is no photo yet). */
export function checkPhotoAccess(calls) {
  if (calls === undefined) {
    return result(
      'Foto ohne Anmeldung',
      [],
      'noch kein Foto vorhanden, nur die Einstellungen geprüft',
    );
  }
  const problems = calls
    .filter(({ response }) => unreachable(response) || response.status < 400)
    .map(
      ({ kind, response }) =>
        `Foto über /object/${kind}/ ${unreachable(response) ?? `mit HTTP ${response.status} geliefert`}`,
    );
  return result('Foto ohne Anmeldung', problems, 'ein Foto ohne Anmeldung wird abgelehnt');
}

/** AC-040: `supabase config diff --exit-code` (0 none, 2 differences, otherwise an error). */
export function checkConfigDiff({ status, stdout }) {
  if (status === 0) return result('Konfiguration', [], 'supabase config diff ohne Abweichung');
  if (status === 2) {
    const lines = (stdout ?? '').split('\n').filter((line) => /^[+-](?![+-]{2})/.test(line)).length;
    return result('Konfiguration', [
      `${lines > 0 ? `${lines} Zeile(n) weichen` : 'Die Konfiguration weicht'} vom Repo ab (supabase/config.toml)`,
    ]);
  }
  return result('Konfiguration', [`supabase config diff fehlgeschlagen (Exit ${status})`]);
}

/** The project ref in `https://<ref>.supabase.co`, or undefined. */
export function projectRef(supabaseUrl) {
  return /^([a-z0-9]+)\.supabase\.(?:co|in)$/.exec(new URL(supabaseUrl).hostname)?.[1];
}

/** Functions of the repository: folders of supabase/functions with an index.ts. */
export function repoFunctions() {
  const dir = path.join(root, 'supabase/functions');
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && !/^[_.]/.test(entry.name) && entry.name !== 'node_modules',
    )
    .filter((entry) => existsSync(path.join(dir, entry.name, 'index.ts')))
    .map((entry) => entry.name)
    .sort();
}

/** Households and accounts of supabase/seed.sql (both columns of household_members). */
export function seedIds() {
  const sql = readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8');
  const households = new Set();
  const accounts = new Set();
  for (const block of sql.match(/insert into public\.household_members[^;]*;/g) ?? []) {
    for (const [, household, account] of block.matchAll(
      /\('([0-9a-f-]{36})', '([0-9a-f-]{36})'/g,
    )) {
      households.add(household);
      accounts.add(account);
    }
  }
  return { households: [...households], accounts: [...accounts] };
}

/** The search path of API requests: [api] schemas, then extra_search_path, each once. */
export function apiSearchPath() {
  const config = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
  const section = /^\[api\]\n([\s\S]*?)(?=^\[)/m.exec(config)?.[1] ?? '';
  const list = (key) =>
    [
      ...(new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]`, 'm').exec(section)?.[1] ?? '').matchAll(
        /"([^"]+)"/g,
      ),
    ].map((match) => match[1]);
  return [...new Set([...list('schemas'), ...list('extra_search_path')])].join(', ');
}

const uuidArray = (ids) => {
  if (!ids.every((id) => UUID.test(id))) throw new Error('Seed-ID ist keine UUID');
  return `'{${ids.join(',')}}'::uuid[]`;
};

function databaseSql({ households, accounts }) {
  return [
    'select',
    "  (select count(*) from auth.users where lower(email) like '%@example.com') as example_accounts,",
    `  (select count(*) from public.households where id = any(${uuidArray(households)})) as seed_households,`,
    `  (select count(*) from auth.users where id = any(${uuidArray(accounts)})) as seed_accounts,`,
    "  (select jsonb_build_object('public', b.public, 'file_size_limit', b.file_size_limit, 'allowed_mime_types', b.allowed_mime_types)",
    `     from storage.buckets b where b.id = '${BUCKET}') as bucket,`,
    "  (select jsonb_build_object('public', b.public, 'file_size_limit', b.file_size_limit, 'allowed_mime_types', b.allowed_mime_types)",
    `     from storage.buckets b where b.id = '${VIDEO_BUCKET}') as video_bucket,`,
    `  (select o.name from storage.objects o where o.bucket_id = '${BUCKET}' and o.name is not null`,
    '     order by o.created_at limit 1) as sample_photo',
  ].join('\n');
}

function graphqlSql(searchPath) {
  if (!/^[a-z_, ]+$/.test(searchPath)) throw new Error('Suchpfad der API ist ungültig');
  return [
    'with ctx as materialized (',
    "  select set_config('role', 'authenticated', true) as role_set,",
    `         set_config('search_path', '${searchPath}', true) as path_set`,
    ')',
    'select current_user as role,',
    `       graphql_public.graphql(query => $q$${INTROSPECTION}$q$) as introspection,`,
    `       graphql_public.graphql(query => $q$${PROBE}$q$) as probe`,
    'from ctx',
  ].join('\n');
}

/** `{ row }` or `{ error }` of a read-only query; never the message of the database. */
function readQuery(supabaseCli, ref, sql, { readOnly = true } = {}) {
  const { status, stdout, error } = supabaseCli([
    'db',
    'query',
    `--remote=${ref}`,
    // The read-only role of the CLI may not `set role authenticated`; the GraphQL probe therefore
    // runs with --yes. It is a fixed select, and set_config(…, true) is local to its transaction.
    readOnly ? '--read-only' : '--yes',
    '--output-format',
    'json',
    sql,
  ]);
  if (error) return { error: `supabase-CLI nicht ausführbar (${error})` };
  const text = stdout ?? '';
  // Without an AI agent the CLI prints the rows as a JSON array; for an agent it wraps them in an
  // object with `rows` and an untrusted-data boundary. Both are read.
  const data = parseJson(text.slice(Math.max(0, text.search(/[[{]/))));
  if (data?._tag === 'Error' || status !== 0) {
    return { error: `Datenbankabfrage fehlgeschlagen (${data?.error?.code ?? `Exit ${status}`})` };
  }
  const row = (Array.isArray(data) ? data : data?.rows)?.[0];
  return row ? { row } : { error: 'Datenbankabfrage ohne Ergebnis' };
}

async function request(fetchImpl, url, init = {}) {
  try {
    const response = await fetchImpl(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    if (typeof response.text !== 'function') return response;
    return {
      status: response.status,
      headers: Object.fromEntries([...response.headers].map(([k, v]) => [k.toLowerCase(), v])),
      body: await response.text(),
    };
  } catch (error) {
    return { error: error?.cause?.code ?? error?.name ?? 'Fehler' };
  }
}

function defaultSupabaseCli(args) {
  const run = spawnSync('supabase', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return { status: run.status, stdout: run.stdout, error: run.error?.code };
}

const encodePath = (name) => name.split('/').map(encodeURIComponent).join('/');

/** Runs every check; resolves to [{ name, ok, detail }]. */
export async function runChecks({
  webOrigin,
  supabaseUrl,
  key,
  environment = 'production',
  expect = {},
  oldOrigin,
  fetchImpl = fetch,
  supabaseCli = defaultSupabaseCli,
}) {
  const webBase = webOrigin.replace(/\/+$/, '');
  const supabase = supabaseUrl.replace(/\/+$/, '');
  const web = (where, init) => request(fetchImpl, `${webBase}${where}`, init);
  const api = (where, init = {}) =>
    request(fetchImpl, `${supabase}${where}`, {
      ...init,
      headers: { apikey: key, ...init.headers },
    });
  const results = [];

  const rootPage = await web('/');
  const index = await web('/index.html');
  const entry = /src="(\/_expo\/static\/js\/web\/[^"]+\.js)"/.exec(index.body ?? '')?.[1];
  results.push(checkSecurityHeaders({ '/': rootPage, '/index.html': index }));
  results.push(checkAppCsp(index.body, supabase));

  const cache = { '/index.html': index };
  for (const where of NO_CACHE.slice(1)) cache[where] = await web(where);
  if (entry) cache[entry] = await web(entry);
  results.push(checkCacheRules(cache, entry));
  results.push(
    checkDeepLinks({ deep: await web(DEEP_LINK), missing: await web(MISSING_FILE) }, entry),
  );
  results.push(checkVersionFile(cache['/version.json'], expect));

  results.push(checkAuthSettings(await api('/auth/v1/settings')));

  const calls = [];
  for (const name of repoFunctions()) {
    for (const [origin, label] of [
      [webBase, 'eigene'],
      [FOREIGN_ORIGIN, 'fremde'],
    ]) {
      const response = await api(`/functions/v1/${name}`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: '{}',
      });
      calls.push({ name, origin: label, response });
    }
  }
  results.push(checkFunctions(calls));

  results.push(
    checkNetRest({
      rpc: await api('/rest/v1/rpc/http_post', {
        method: 'POST',
        headers: { 'content-profile': 'net', 'content-type': 'application/json' },
        body: '{}',
      }),
      table: await api('/rest/v1/http_request_queue', { headers: { 'accept-profile': 'net' } }),
    }),
  );
  const graphql = async (query) =>
    parseJson(
      (
        await api('/graphql/v1', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query }),
        })
      ).body ?? '',
    );
  results.push(
    checkGraphql('anon', {
      introspection: await graphql(INTROSPECTION),
      probe: await graphql(PROBE),
    }),
  );

  const ref = projectRef(supabase);
  const noRef = { error: 'Projekt-Ref nicht aus der Supabase-Adresse ableitbar' };
  const asAuthenticated = ref
    ? readQuery(supabaseCli, ref, graphqlSql(apiSearchPath()), { readOnly: false })
    : noRef;
  if (asAuthenticated.error) {
    results.push(result('GraphQL ohne net (authenticated)', [asAuthenticated.error]));
  } else if (asAuthenticated.row.role !== 'authenticated') {
    results.push(
      result('GraphQL ohne net (authenticated)', ['Rolle authenticated ließ sich nicht setzen']),
    );
  } else {
    results.push(checkGraphql('authenticated', asAuthenticated.row));
  }

  const database = ref ? readQuery(supabaseCli, ref, databaseSql(seedIds())) : noRef;
  if (database.error) {
    for (const name of ['Keine Seed-Daten', 'Foto-Bucket', 'Video-Bucket', 'Foto ohne Anmeldung']) {
      results.push(result(name, [database.error]));
    }
  } else {
    results.push(checkSeedData(database.row, environment));
    results.push(checkPhotoBucket(database.row.bucket));
    results.push(checkVideoBucket(database.row.video_bucket));
    const photo = database.row.sample_photo;
    const access =
      typeof photo === 'string' && photo !== ''
        ? [
            {
              kind: 'public',
              response: await api(`/storage/v1/object/public/${BUCKET}/${encodePath(photo)}`),
            },
            {
              kind: 'authenticated',
              response: await api(
                `/storage/v1/object/authenticated/${BUCKET}/${encodePath(photo)}`,
              ),
            },
          ]
        : undefined;
    results.push(checkPhotoAccess(access));
  }

  if (oldOrigin !== undefined) {
    const old = oldOrigin.replace(/\/+$/, '');
    results.push(
      checkOldOrigin(old ? await request(fetchImpl, `${old}/kalender`) : undefined, webBase, old),
    );
  }

  if (ref) {
    const diff = supabaseCli(['config', 'diff', `--remote=${ref}`, '--exit-code']);
    results.push(
      diff.error
        ? result('Konfiguration', [`supabase-CLI nicht ausführbar (${diff.error})`])
        : checkConfigDiff(diff),
    );
  } else {
    results.push(result('Konfiguration', [noRef.error]));
  }
  return results;
}

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      environment: { type: 'string', default: 'production' },
      version: { type: 'string' },
      commit: { type: 'string' },
      'old-origin': { type: 'string' },
    },
  });
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (positionals.length !== 2 || !['production', 'preview'].includes(values.environment) || !key) {
    console.error(
      'Usage: SUPABASE_PUBLISHABLE_KEY=… node scripts/release/verify.mjs <web-origin> <supabase-url> [--environment production|preview] [--version <v>] [--commit <sha>] [--old-origin <url>]',
    );
    return 2;
  }
  const [webOrigin, supabaseUrl] = positionals;
  const results = await runChecks({
    webOrigin,
    supabaseUrl,
    key,
    environment: values.environment,
    expect: { version: values.version, commit: values.commit },
    oldOrigin: values['old-origin'],
  });
  const inActions = process.env.GITHUB_ACTIONS === 'true';
  for (const { name, ok, detail } of results) {
    console.log(`${ok ? 'ok    ' : 'FEHLER'}  ${name}: ${detail}`);
    // Workflow commands (::error::) are read from stdout.
    if (!ok && inActions) console.log(`::error::${name}: ${detail}`);
  }
  const failures = results.filter((r) => !r.ok).length;
  console.log(
    failures === 0
      ? `Prüfung nach der Auslieferung: alle ${results.length} Prüfungen ok.`
      : `Prüfung nach der Auslieferung: ${failures} von ${results.length} Prüfungen FEHLER.`,
  );
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
