// The API exposes only the schemas public and graphql_public (spec 0013, security check finding 1).
// Supabase grants PUBLIC access to pg_net's queue (net.http_request_queue) and execute on
// net.http_post to anon and authenticated, as supabase_admin, so no migration can take it back.
// What keeps members away from pg_net is that PostgREST never serves the schema net. The setting
// is not readable from SQL (pgTAP cannot see it), so this test pins it in supabase/config.toml;
// the same check for the cloud project is a release item of spec 0014.
//
//   node --test scripts/api-schemas.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ALLOWED = ['graphql_public', 'public'];

/** The value of `schemas = [...]` in the [api] section of a config.toml. */
function apiSchemas(toml) {
  const section = toml.split(/^\[/m).find((part) => part.startsWith('api]'));
  const line = section?.match(/^schemas\s*=\s*\[([^\]]*)\]/m);
  if (!line) throw new Error('no schemas in [api]');
  return [...line[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
}

test('security check 0013: the local API exposes only public and graphql_public', () => {
  const toml = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  assert.deepEqual(apiSchemas(toml), ALLOWED);
});

test('security check 0013: an exposed net schema is noticed', () => {
  const toml = '[api]\nenabled = true\nschemas = ["public", "graphql_public", "net"]\n[db]\n';
  assert.notDeepEqual(apiSchemas(toml), ALLOWED);
  assert.ok(apiSchemas(toml).includes('net'));
});
