const ALLOW = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '600',
};

/**
 * Browsers may call only from the configured origins. Requests without an Origin header (native
 * apps, scripts) carry no ambient credentials and are allowed; authentication still applies.
 */
export function cors(
  request: Request,
  allowedOrigins: string[],
): { allowed: boolean; headers: { [name: string]: string } } {
  const origin = request.headers.get('origin');
  if (origin === null) return { allowed: true, headers: { Vary: 'Origin' } };
  if (!allowedOrigins.includes(origin)) return { allowed: false, headers: { Vary: 'Origin' } };
  return {
    allowed: true,
    headers: { ...ALLOW, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' },
  };
}
