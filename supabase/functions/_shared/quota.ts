import type { UserClient } from './deps.ts';
import { HttpError } from './errors.ts';

export type QuotaKind = 'request' | 'speech';

/**
 * Charges the caller's daily AI quota through `consume_ai_quota` before any paid call. Runs with
 * the caller's own client, so the database counts for `auth.uid()`. The RPC may answer `true`,
 * `{ allowed: true }`, or raise `quota_exceeded`; anything else fails closed.
 */
export async function consumeQuota(
  client: UserClient,
  kind: QuotaKind,
  /** Units of the quota; an answer of the KI-Agent costs more than one (spec 0066, decision 13). */
  amount = 1,
): Promise<void> {
  const { data, error } = await client.rpc('consume_ai_quota', { kind, amount });
  if (error) {
    if (error.message.includes('quota_exceeded')) throw new HttpError('quota_exceeded');
    console.error('quota_check_failed', { code: error.code });
    throw new HttpError('internal');
  }
  const allowed =
    data === true ||
    (typeof data === 'object' && data !== null && 'allowed' in data && data.allowed === true);
  if (!allowed) throw new HttpError('quota_exceeded');
}
