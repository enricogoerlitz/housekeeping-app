import { z } from 'zod';

import type { Id } from './types';

const RouteIdSchema = z.uuid();

/**
 * The id of a detail page from the address (`/rezept/[id]`, `?aid=`): a deep link is input, so
 * only a uuid counts; anything else is no id and the page shows "nicht gefunden". Of a repeated
 * parameter the first one counts.
 */
export function routeId(value: string | readonly string[] | undefined): Id | undefined {
  const first = typeof value === 'string' ? value : value?.[0];
  const parsed = RouteIdSchema.safeParse(first);
  return parsed.success ? parsed.data : undefined;
}
