// Smoke test for the edge functions against the local stack (`supabase start`).
// Env: ANON_KEY (legacy anon JWT from `supabase status`), TEST_EMAIL, TEST_PASSWORD of a seeded
// account; optional SUPABASE_URL (default http://127.0.0.1:54321). Never prints tokens or keys.
const base = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const { ANON_KEY: anonKey, TEST_EMAIL: email, TEST_PASSWORD: password } = process.env;
for (const [name, value] of Object.entries({
  ANON_KEY: anonKey,
  TEST_EMAIL: email,
  TEST_PASSWORD: password,
})) {
  if (!value) {
    console.error(`${name} is not set`);
    process.exit(2);
  }
}

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function call(name, jwt, body) {
  const response = await fetch(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => undefined);
  return { status: response.status, json };
}

const signIn = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anonKey, 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const session = await signIn.json().catch(() => ({}));
check('password sign-in of the test account', signIn.ok, `HTTP ${signIn.status}`);
if (!signIn.ok) process.exit(1);
const jwt = session.access_token;

const memberships = await fetch(`${base}/rest/v1/household_members?select=household_id&limit=1`, {
  headers: { apikey: anonKey, authorization: `Bearer ${jwt}` },
}).then((r) => r.json());
const householdId = memberships?.[0]?.household_id;
check('test account belongs to a household', Boolean(householdId));

const place = 'https://www.google.com/maps/place/Trattoria+Da+Enzo/@50.9271,6.9580,17z';
const calls = {
  'speech-token': {},
  'resolve-maps-link': { url: place },
  'ai-search': { householdId, query: 'was Schnelles mit Tofu' },
  'ai-assistant': { householdId, message: 'Was koche ich heute?', context: {} },
};

for (const [name, body] of Object.entries(calls)) {
  const anon = await call(name, anonKey, body);
  check(`${name}: anon key → 401`, anon.status === 401, `HTTP ${anon.status}`);
  const user = await call(name, jwt, body);
  const shape = user.json && typeof user.json === 'object' ? Object.keys(user.json).join(',') : '';
  check(`${name}: user JWT → 200`, user.status === 200, `HTTP ${user.status} {${shape}}`);
}

const foreign = await call('resolve-maps-link', jwt, {
  url: 'https://maps.app.goo.gl@127.0.0.1/x',
});
check('resolve-maps-link: foreign host → 422', foreign.status === 422, `HTTP ${foreign.status}`);
const otherHousehold = await call('ai-assistant', jwt, {
  householdId: '00000000-0000-4000-8000-000000000000',
  message: 'Hallo',
  context: {},
});
check(
  'ai-assistant: invisible household → 400',
  otherHousehold.status === 400,
  `HTTP ${otherHousehold.status}`,
);

process.exit(failures === 0 ? 0 : 1);
