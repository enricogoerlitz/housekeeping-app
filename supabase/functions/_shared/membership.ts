import type { UserClient } from './deps.ts';
import { HttpError } from './errors.ts';

/**
 * The caller is a member of `householdId`, else 403 `forbidden`. Under the caller's RLS: a
 * household she is no member of shows no member rows. A failing lookup fails closed (500).
 */
export async function requireMember(client: UserClient, householdId: string): Promise<void> {
  const { data, error } = await client
    .from('household_members')
    .select('household_id')
    .eq('household_id', householdId)
    .limit(1);
  if (error) throw new Error('membership_lookup_failed');
  if (!Array.isArray(data) || data.length === 0) throw new HttpError('forbidden');
}
