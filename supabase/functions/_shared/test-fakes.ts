// Fakes for handler tests: an in-memory Supabase client and a deps builder.
import { vi } from 'vitest';

import type { DbResult, Deps, Query, UserClient } from './deps.ts';

export type Row = { [column: string]: unknown };

export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const USER_JWT = 'eyJhbGciOiJFUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.c2ln';
export const ANON_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2ln';

export interface FakeClientOptions {
  /** Claims per JWT; a JWT not listed fails verification. */
  claims?: { [jwt: string]: { [claim: string]: unknown } };
  tables?: { [table: string]: Row[] };
  rpc?: (fn: string, args: { [name: string]: unknown }) => DbResult;
}

export interface FakeClient extends UserClient {
  rpcCalls: { fn: string; args: { [name: string]: unknown } }[];
  selects: { table: string; columns: string }[];
}

function query(rows: Row[]): Query {
  const result = (): DbResult => ({ data: rows, error: null });
  const next = (filtered: Row[]) => query(filtered);
  return {
    eq: (column, value) => next(rows.filter((row) => row[column] === value)),
    in: (column, values) => next(rows.filter((row) => values.includes(String(row[column])))),
    gte: (column, value) => next(rows.filter((row) => String(row[column]) >= value)),
    lte: (column, value) => next(rows.filter((row) => String(row[column]) <= value)),
    limit: (count) => next(rows.slice(0, count)),
    then: (onFulfilled, onRejected) => Promise.resolve(result()).then(onFulfilled, onRejected),
  };
}

export function fakeClient(options: FakeClientOptions = {}): FakeClient {
  const claims = options.claims ?? {
    [USER_JWT]: { role: 'authenticated', sub: USER_ID },
    [ANON_JWT]: { role: 'anon' },
  };
  const client: FakeClient = {
    rpcCalls: [],
    selects: [],
    auth: {
      getClaims: async (jwt) => {
        const found = claims[jwt];
        return found
          ? { data: { claims: found }, error: null }
          : { data: null, error: { message: 'invalid JWT' } };
      },
    },
    rpc: (fn, args) => {
      client.rpcCalls.push({ fn, args });
      const result = options.rpc ? options.rpc(fn, args) : { data: true, error: null };
      return Promise.resolve(result);
    },
    from: (table) => ({
      select: (columns) => {
        client.selects.push({ table, columns });
        return query(options.tables?.[table] ?? []);
      },
    }),
  };
  return client;
}

export const BASE_ENV: { [name: string]: string } = {
  ALLOWED_ORIGINS: 'http://localhost:8081,https://app.example.test',
  FOUNDRY_API_KEY: 'test-foundry-key-SECRET',
  FOUNDRY_OPENAI_BASE_URL: 'https://foundry.example.test/openai/v1',
  FOUNDRY_LLM_DEPLOYMENT: 'test-llm',
  FOUNDRY_SPEECH_REGION: 'westeurope',
  FOUNDRY_STT_LANGUAGE: 'de-DE',
};

export function fakeDeps(
  overrides: { client?: FakeClient; fetch?: typeof fetch; env?: { [name: string]: string } } = {},
): Deps & { client: FakeClient; fetchMock: ReturnType<typeof vi.fn<typeof fetch>> } {
  const client = overrides.client ?? fakeClient();
  const fetchMock = vi.fn<typeof fetch>(
    overrides.fetch ?? (async () => new Response('unexpected fetch', { status: 599 })),
  );
  const env = { ...BASE_ENV, ...overrides.env };
  return {
    client,
    fetchMock,
    fetch: fetchMock,
    env: (name) => env[name],
    createUserClient: () => client,
    now: () => new Date('2026-11-20T09:30:00Z'),
  };
}

export function post(
  body: unknown,
  options: { jwt?: string | null; origin?: string; method?: string; raw?: string } = {},
): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  const jwt = options.jwt === undefined ? USER_JWT : options.jwt;
  if (jwt) headers.set('authorization', `Bearer ${jwt}`);
  if (options.origin) headers.set('origin', options.origin);
  const method = options.method ?? 'POST';
  return new Request('http://localhost/functions/v1/test', {
    method,
    headers,
    body: method === 'POST' ? (options.raw ?? JSON.stringify(body)) : undefined,
  });
}

/** A Foundry Responses API reply whose structured output is `output`. */
export function foundryReply(
  output: unknown,
  shape: 'output_text' | 'output' = 'output',
): Response {
  const text = JSON.stringify(output);
  const body =
    shape === 'output_text'
      ? { output_text: text }
      : { output: [{ type: 'message', content: [{ type: 'output_text', text }] }] };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
