import type { Deps, UserClient } from './deps.ts';
import { HttpError } from './errors.ts';

/**
 * Verifies the caller's JWT with Supabase Auth and returns a client acting as them. Only signed-in,
 * non-anonymous users pass: the anon key is itself a valid JWT (role `anon`) and must get 401.
 */
export async function authenticate(
  request: Request,
  deps: Deps,
): Promise<{ client: UserClient; userId: string }> {
  const authorization = request.headers.get('authorization') ?? '';
  const jwt = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/.exec(authorization)?.[1];
  if (!jwt) throw new HttpError('unauthorized');
  const client = deps.createUserClient(authorization);
  const result = await client.auth.getClaims(jwt).catch(() => undefined);
  const claims = result && !result.error ? result.data?.claims : undefined;
  if (
    !claims ||
    claims.role !== 'authenticated' ||
    claims.is_anonymous === true ||
    typeof claims.sub !== 'string'
  )
    throw new HttpError('unauthorized');
  return { client, userId: claims.sub };
}
