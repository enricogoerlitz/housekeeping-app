// Requests the database sends through pg_net (media-sweep, spec 0039): an
// HMAC-SHA256 over "<timestamp>.<body>" with a secret shared between the Vault and the function,
// in hex, next to the timestamp in Unix seconds. The secret itself never sits in pg_net's queue.

/** A signature older than this is refused (seconds). */
const MAX_SIGNATURE_AGE_S = 300;
/** Clock skew tolerated for a timestamp in the future (seconds). */
const MAX_CLOCK_SKEW_S = 60;

/** Unix seconds, as the database writes them, at most 5 minutes old; anything else is null. */
export function freshTimestamp(value: string | null, nowMs: number): string | null {
  if (value === null || !/^\d{1,12}$/.test(value)) return null;
  const age = Math.floor(nowMs / 1000) - Number(value);
  return age <= MAX_SIGNATURE_AGE_S && age >= -MAX_CLOCK_SKEW_S ? value : null;
}

function hexBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/.test(value)) return null;
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/**
 * HMAC-SHA256 of "<timestamp>.<body>" with the shared secret, compared byte by byte without an
 * early exit, so timing tells nothing about the expected value.
 */
export async function validSignature(
  secret: string,
  timestamp: string,
  body: Uint8Array,
  given: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const prefix = encoder.encode(`${timestamp}.`);
  const signed = new Uint8Array(prefix.byteLength + body.byteLength);
  signed.set(prefix, 0);
  signed.set(body, prefix.byteLength);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed));
  const actual = hexBytes(given);
  if (actual === null) return false;
  let difference = 0;
  for (let i = 0; i < expected.byteLength; i += 1)
    difference |= (actual[i] ?? 0) ^ (expected[i] ?? 0);
  return difference === 0;
}
