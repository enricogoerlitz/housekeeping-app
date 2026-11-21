/**
 * The known push services (spec 0013, Decision 20). Character for character the pattern of
 * `private.is_push_endpoint` in the database: https, one of the known hosts, no port, no
 * credentials, a path of URL characters only. push-send checks it again before every fetch, so an
 * address that slipped past the database still reaches no internal host (AC-044).
 */
const PUSH_ENDPOINT = new RegExp(
  '^https://(fcm\\.googleapis\\.com|updates\\.push\\.services\\.mozilla\\.com|web\\.push\\.apple\\.com' +
    '|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\\.notify\\.windows\\.com)' +
    "/[A-Za-z0-9._~:/?@!$&'()*+,;=%-]*$",
);

export const MAX_PUSH_ENDPOINT_LENGTH = 1024;

export function isPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > MAX_PUSH_ENDPOINT_LENGTH) return false;
  const match = PUSH_ENDPOINT.exec(endpoint);
  if (!match) return false;
  // The URL parser must see the same host the pattern saw.
  try {
    return new URL(endpoint).host === match[1];
  } catch {
    return false;
  }
}
