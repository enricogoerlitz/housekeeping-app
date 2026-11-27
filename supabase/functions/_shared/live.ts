import { createClient } from '@supabase/supabase-js';

import type { ClaimsResult, DbResult, Deps, Query, StorageResult, UserClient } from './deps.ts';
import { ConfigError, requireEnv } from './errors.ts';
import { resolveAddresses } from './fetch-public.ts';

/**
 * The publishable key from SUPABASE_PUBLISHABLE_KEYS ({"default": "sb_publishable_…"}), else the
 * anon key: the local stack of Supabase CLI 3.2.0 injects only SUPABASE_ANON_KEY (checked
 * 2026-11-21).
 */
function publishableKey(env: Deps['env']): string {
  const keys = env('SUPABASE_PUBLISHABLE_KEYS');
  if (!keys) return requireEnv(env, 'SUPABASE_ANON_KEY');
  try {
    const parsed = JSON.parse(keys) as { [name: string]: unknown };
    const key = parsed.default ?? Object.values(parsed)[0];
    if (typeof key === 'string' && key) return key;
  } catch {
    // fall through to the error below
  }
  throw new ConfigError('SUPABASE_PUBLISHABLE_KEYS has no usable key');
}

function userClient(env: Deps['env'], authorization: string): UserClient {
  const client = createClient(requireEnv(env, 'SUPABASE_URL'), publishableKey(env), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // Explicit row type: a non-literal select string would make supabase-js parse it at type level.
  const select = (table: string, columns: string) =>
    client.from(table).select<string, { [column: string]: unknown }>(columns);
  type Builder = ReturnType<typeof select>;
  // Wrapping each call keeps tsc from comparing the deep builder type with `Query` structurally.
  const wrap = (builder: Builder): Query => ({
    eq: (column, value) => wrap(builder.eq(column, value)),
    in: (column, values) => wrap(builder.in(column, values)),
    gte: (column, value) => wrap(builder.gte(column, value)),
    lte: (column, value) => wrap(builder.lte(column, value)),
    limit: (count) => wrap(builder.limit(count)),
    order: (column) => wrap(builder.order(column, { ascending: true })),
    range: (from, to) => wrap(builder.range(from, to)),
    then: (onFulfilled, onRejected) =>
      builder
        .then(({ data, error }): DbResult => ({
          data,
          error: error ? { message: error.message, code: error.code } : null,
        }))
        .then(onFulfilled, onRejected),
  });
  // storage-js errors carry the Storage API's status in statusCode (a string) or status.
  const stored = (error: unknown): StorageResult => {
    if (!error) return { error: null };
    const fields = error as { message?: unknown; status?: unknown; statusCode?: unknown };
    const status = Number(fields.statusCode ?? fields.status);
    return {
      error: {
        message: typeof fields.message === 'string' ? fields.message : 'storage_failed',
        ...(Number.isInteger(status) && status > 0 ? { status } : {}),
      },
    };
  };
  return {
    auth: { getClaims: (jwt): Promise<ClaimsResult> => client.auth.getClaims(jwt) },
    storage: {
      // cacheControl '0': no CDN or browser keeps a copy (like the photos, packages/api).
      upload: async (bucket, path, bytes, contentType) =>
        stored(
          (
            await client.storage
              .from(bucket)
              .upload(path, bytes, { contentType, upsert: false, cacheControl: '0' })
          ).error,
        ),
      remove: async (bucket, paths) =>
        stored((await client.storage.from(bucket).remove(paths)).error),
    },
    rpc: (fn, args) =>
      client.rpc(fn, args).then(({ data, error }): DbResult => ({
        data,
        error: error ? { message: error.message, code: error.code } : null,
      })),
    from: (table) => ({ select: (columns) => wrap(select(table, columns)) }),
  };
}

/** Real dependencies inside the Supabase Edge Runtime. Never uses a service-role or secret key. */
export function liveDeps(): Deps {
  const env: Deps['env'] = (name) => Deno.env.get(name);
  return {
    env,
    fetch: (input, init) => fetch(input, init),
    now: () => new Date(),
    resolveDns: (hostname) =>
      resolveAddresses(hostname, (host, type) => Deno.resolveDns(host, type)),
    createUserClient: (authorization) => userClient(env, authorization),
  };
}
