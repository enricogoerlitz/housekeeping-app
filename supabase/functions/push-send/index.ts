import { SEND_TIMEOUT_MS, handler, type PushSendDeps } from './handler.ts';
import { createWebPushSender, guardFetch } from './web-push.ts';

// The only environment this function may see (AC-046). The runtime also injects SUPABASE_* values,
// including the service-role key; they are never read.
const ALLOWED_ENV = new Set([
  'PUSH_SEND_SECRET',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
]);

// The web push library uses the global fetch; this worker makes no other requests.
globalThis.fetch = guardFetch(globalThis.fetch.bind(globalThis), SEND_TIMEOUT_MS);

const deps: PushSendDeps = {
  env: (name) => (ALLOWED_ENV.has(name) ? Deno.env.get(name) : undefined),
  createSender: createWebPushSender,
};
Deno.serve((request) => handler(request, deps));
