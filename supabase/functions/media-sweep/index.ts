import { createClient } from '@supabase/supabase-js';

import { handler, type Remover } from './handler.ts';

// The only environment this function may see (spec 0039, ADR-0016): the shared secret, and the
// server key for the Storage API (new secret key, else the legacy service-role key).
const ALLOWED_ENV = new Set([
  'MEDIA_SWEEP_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEYS',
  'SUPABASE_SERVICE_ROLE_KEY',
]);

function createRemover(config: { url: string; key: string }): Remover {
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return async (bucket, names) => {
    const { data, error } = await client.storage.from(bucket).remove(names);
    if (error) throw new Error('storage_remove_failed');
    return { removed: data.length };
  };
}

Deno.serve((request) =>
  handler(request, {
    env: (name) => (ALLOWED_ENV.has(name) ? Deno.env.get(name) : undefined),
    createRemover,
  }),
);
