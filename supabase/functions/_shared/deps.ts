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
  /** Spec 0067: stable pages of the agent's reads. */
  order(column: string): Query;
  range(from: number, to: number): Query;
}

export interface ClaimsResult {
  data: { claims: { [claim: string]: unknown } } | null;
  error: unknown;
}

/** A storage request's outcome; `status` is the Storage API's own (413 for a file too large). */
export interface StorageResult {
  error: { message: string; status?: number } | null;
}

/** Storage as the caller (spec 0043): the bucket's policies decide, never a server key. */
export interface UserStorage {
  /** Stores a new object; never overwrites one. */
  upload(
    bucket: string,
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<StorageResult>;
  remove(bucket: string, paths: string[]): Promise<StorageResult>;
}

/** A Supabase client acting as the caller: every read and RPC runs under their RLS. */
export interface UserClient {
  auth: { getClaims(jwt: string): Promise<ClaimsResult> };
  rpc(fn: string, args: { [name: string]: unknown }): PromiseLike<DbResult>;
  from(table: string): { select(columns: string): Query };
  storage: UserStorage;
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
