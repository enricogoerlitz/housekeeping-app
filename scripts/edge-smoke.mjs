// Smoke test for the edge functions against the local stack. Local only.
//
//   set -a; . ./.env; set +a; pnpm exec supabase start     # once; functions are served by the stack
//   set -a; . ./.env; set +a; node scripts/edge-smoke.mjs
//
// Creates a test account and household with scripts/edge-smoke-fixture.sql (psql as postgres via
// `docker exec` into the db container), signs in with password, calls every function and removes
// the fixture again. Makes two real Foundry LLM calls and one speech-token call. Prints status
// codes, reply keys and timings only — never tokens or keys.
//
// Optional env: SUPABASE_URL (default: API URL of `supabase status`), ANON_KEY (default: the
// legacy anon key of `supabase status`), DB_CONTAINER (default supabase_db_housekeeping-app).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  AiSearchResultSchema,
  AssistantReplySchema,
  SpeechTokenReplySchema,
} from '../packages/core/src/ai-contract.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = readFileSync(new URL('edge-smoke-fixture.sql', import.meta.url), 'utf8');
const dbContainer = process.env.DB_CONTAINER ?? 'supabase_db_housekeeping-app';
const email = 'edge-smoke@example.com';
const password = 'fake-smoke-password-not-secret';
const foreignHousehold = '00000000-0000-4000-8000-000000000000';

function localStatus() {
  const out = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out.slice(out.indexOf('{')));
}

function psql(sql, cleanup) {
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      dbContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-q',
      '-v',
      `cleanup=${cleanup}`,
    ],
    { input: sql, stdio: ['pipe', 'ignore', 'inherit'] },
  );
}

const status = process.env.SUPABASE_URL && process.env.ANON_KEY ? {} : localStatus();
const base = process.env.SUPABASE_URL ?? status.API_URL;
const anonKey = process.env.ANON_KEY ?? status.ANON_KEY;
if (!base || !anonKey) {
  console.error('local stack not running (no API URL / anon key from `supabase status`)');
  process.exit(2);
}

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function call(name, jwt, body, headers = {}) {
  const started = performance.now();
  const response = await fetch(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  const ms = Math.round(performance.now() - started);
  const keys = json && typeof json === 'object' ? Object.keys(json).join(',') : '';
  const error = json && typeof json.error === 'string' ? ` error=${json.error}` : '';
  return {
    status: response.status,
    json,
    text,
    detail: `HTTP ${response.status} {${keys}}${error} ${ms} ms`,
  };
}

psql(fixture, false);
try {
  const signIn = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const session = await signIn.json().catch(() => ({}));
  check('password sign-in of the fixture account', signIn.ok, `HTTP ${signIn.status}`);
  if (!signIn.ok) throw new Error('sign-in failed');
  const jwt = session.access_token;

  const memberships = await fetch(`${base}/rest/v1/household_members?select=household_id`, {
    headers: { apikey: anonKey, authorization: `Bearer ${jwt}` },
  }).then((r) => r.json());
  const householdId = memberships?.[0]?.household_id;
  check('fixture account belongs to one household', memberships?.length === 1);
  const recipes = await fetch(`${base}/rest/v1/recipes?select=id&household_id=eq.${householdId}`, {
    headers: { apikey: anonKey, authorization: `Bearer ${jwt}` },
  }).then((r) => r.json());
  const recipeId = recipes?.[0]?.id;

  const bodies = {
    'speech-token': {},
    'resolve-maps-link': {
      url: 'https://www.google.com/maps/place/Trattoria+Da+Enzo/@50.9271,6.9580,17z',
    },
    'ai-search': { householdId, query: 'was Schnelles mit Tofu' },
    'ai-assistant': {
      householdId,
      message: 'Mach das Rezept für 4 Personen.',
      context: { recipeId },
    },
  };

  // Signed out: the anon key is a valid JWT with role anon and must not pass.
  for (const [name, body] of Object.entries(bodies)) {
    const anon = await call(name, anonKey, body);
    check(`${name}: anon key → 401`, anon.status === 401, anon.detail);
  }
  const noAuth = await fetch(`${base}/functions/v1/speech-token`, { method: 'POST' });
  check('speech-token: no Authorization → 401', noAuth.status === 401, `HTTP ${noAuth.status}`);

  // CORS. Locally Kong's cors plugin answers every preflight itself (allow-origin *), so the
  // functions' own preflight handling is covered by the unit tests only. The functions' origin
  // check still refuses real requests from a foreign origin.
  const preflight = await fetch(`${base}/functions/v1/ai-search`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:8081',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, apikey, content-type',
    },
  });
  check(
    'CORS preflight from http://localhost:8081 → 2xx',
    preflight.ok,
    `HTTP ${preflight.status}`,
  );
  const fromApp = await call('resolve-maps-link', jwt, bodies['resolve-maps-link'], {
    origin: 'http://localhost:8081',
  });
  check('POST from http://localhost:8081 → 200', fromApp.status === 200, fromApp.detail);
  const fromEvil = await call('resolve-maps-link', jwt, bodies['resolve-maps-link'], {
    origin: 'https://evil.example',
  });
  check('POST from https://evil.example → 403', fromEvil.status === 403, fromEvil.detail);

  // Signed in.
  const speech = await call('speech-token', jwt, bodies['speech-token']);
  const foundryKey = process.env.FOUNDRY_API_KEY;
  check(
    'speech-token: user JWT → 200, contract reply, no API key in it',
    speech.status === 200 &&
      SpeechTokenReplySchema.safeParse(speech.json).success &&
      (!foundryKey || !speech.text.includes(foundryKey)),
    speech.detail,
  );

  const place = await call('resolve-maps-link', jwt, bodies['resolve-maps-link']);
  check(
    'resolve-maps-link: long Google URL → 200 with name and location',
    place.status === 200 &&
      place.json?.name === 'Trattoria Da Enzo' &&
      place.json?.location?.lat === 50.9271,
    place.detail,
  );
  for (const url of ['https://evil.example/', 'https://maps.app.goo.gl@127.0.0.1/x']) {
    const refused = await call('resolve-maps-link', jwt, { url });
    check(`resolve-maps-link: ${url} → 422`, refused.status === 422, refused.detail);
  }

  const search = await call('ai-search', jwt, bodies['ai-search']);
  const searchOk = AiSearchResultSchema.safeParse(search.json).success;
  check(
    'ai-search: user JWT → 200, contract reply, only own recipe ids',
    search.status === 200 && searchOk && search.json.results.every((r) => r.recipeId === recipeId),
    `${search.detail} results=${search.json?.results?.length ?? '-'}`,
  );

  const assistant = await call('ai-assistant', jwt, bodies['ai-assistant']);
  check(
    'ai-assistant: user JWT → 200, contract reply',
    assistant.status === 200 && AssistantReplySchema.safeParse(assistant.json).success,
    `${assistant.detail} parts=${assistant.json?.proposal?.parts?.map((p) => p.command.type).join('+') ?? '-'}`,
  );

  const hidden = await call('ai-assistant', jwt, {
    householdId: foreignHousehold,
    message: 'Hallo',
    context: {},
  });
  check('ai-assistant: household not visible → 400', hidden.status === 400, hidden.detail);

  // Quota used up (AC-030): refused before any Foundry call.
  psql(
    `insert into public.ai_usage (profile_id, day, requests)
     select id, (now() at time zone 'Europe/Berlin')::date, 200 from public.profiles
     where email = '${email}'
     on conflict (profile_id, day) do update set requests = 200;`,
    false,
  );
  const exhausted = await call('ai-assistant', jwt, bodies['ai-assistant']);
  check('ai-assistant: quota used up → 429', exhausted.status === 429, exhausted.detail);
  const exhaustedSearch = await call('ai-search', jwt, bodies['ai-search']);
  check('ai-search: quota used up → 429', exhaustedSearch.status === 429, exhaustedSearch.detail);
} catch (error) {
  failures += 1;
  console.log(`FAIL ${error instanceof Error ? error.message : 'unexpected error'}`);
} finally {
  psql(fixture, true);
  console.log('fixture removed');
}

process.exit(failures === 0 ? 0 : 1);
