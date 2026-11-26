// Everything a handler touches outside itself, injected so vitest can run handlers without Deno.

export interface DbError {
  message: string;
  code?: string;
}

export interface DbResult {
  data: unknown;
  error: DbError | null;
}

/** The part of the PostgREST query builder the functions use. */
export interface Query extends PromiseLike<DbResult> {
  eq(column: string, value: string): Query;
  in(column: string, values: string[]): Query;
  gte(column: string, value: string): Query;
  lte(column: string, value: string): Query;
  limit(count: number): Query;
}

export interface ClaimsResult {
  data: { claims: { [claim: string]: unknown } } | null;
  error: unknown;
}

/** A Supabase client acting as the caller: every read and RPC runs under their RLS. */
export interface UserClient {
  auth: { getClaims(jwt: string): Promise<ClaimsResult> };
  rpc(fn: string, args: { [name: string]: unknown }): PromiseLike<DbResult>;
  from(table: string): { select(columns: string): Query };
}

export interface Deps {
  fetch: typeof fetch;
  env: (name: string) => string | undefined;
  /** `authorization` is the caller's own `Authorization` header. */
  createUserClient: (authorization: string) => UserClient;
  now: () => Date;
  /** Every A and AAAA address of a host name (fetch-public's SSRF check). */
  resolveDns: (hostname: string) => Promise<string[]>;
}
