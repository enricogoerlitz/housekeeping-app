// Web Push delivery (RFC 8030) with the maintained library jsr:@negrel/webpush: it encrypts the
// payload (RFC 8291, aes128gcm) and signs the VAPID JWT (RFC 8292) with WebCrypto. We do not build
// any of that ourselves (lead's decision in the plan of spec 0013); this file only adapts keys,
// options and the answer.
import { ApplicationServer, PushMessageError, Urgency, importVapidKeys } from '@negrel/webpush';

import { ConfigError } from '../_shared/errors.ts';

export interface VapidConfig {
  /** base64url of the uncompressed P-256 point (65 bytes), the same value the app subscribes with. */
  publicKey: string;
  /** base64url of the P-256 private scalar `d` (32 bytes). */
  privateKey: string;
  /** `sub` claim: an `https:` or `mailto:` URI (RFC 8292 §2.1). */
  subject: string;
}

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  ttl: number;
  urgency: 'normal' | 'high';
}

/** HTTP status of the push service, or null when no answer came (network, time limit, bad key). */
export type PushSender = (target: PushTarget, payload: string) => Promise<number | null>;

/**
 * The library resolves without the response on any 2xx, so the exact success code is lost. RFC 8030
 * §5 has push services answer 201 Created; the database treats every 2xx alike.
 */
export const PUSH_SUCCESS_STATUS = 201;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('not base64url');
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeKey(text: string, length: number, name: string) {
  try {
    const bytes = fromBase64Url(text);
    if (bytes.length === length) return bytes;
  } catch {
    // reported below, without the value
  }
  throw new ConfigError(`${name} is not a base64url P-256 key of ${length} bytes`);
}

async function importKeys(config: VapidConfig): Promise<CryptoKeyPair> {
  const raw = decodeKey(config.publicKey, 65, 'VAPID_PUBLIC_KEY');
  if (raw[0] !== 0x04) throw new ConfigError('VAPID_PUBLIC_KEY is not an uncompressed P-256 key');
  const d = toBase64Url(decodeKey(config.privateKey, 32, 'VAPID_PRIVATE_KEY'));
  const point = {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(raw.slice(1, 33)),
    y: toBase64Url(raw.slice(33)),
  };
  let keys: CryptoKeyPair;
  try {
    keys = await importVapidKeys({ publicKey: point, privateKey: { ...point, d } });
  } catch {
    throw new ConfigError('VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is not a valid P-256 key');
  }
  // WebCrypto does not check that d belongs to (x, y); a mismatch would fail every push with 403.
  const probe = new TextEncoder().encode('vapid key check');
  const algorithm = { name: 'ECDSA', hash: 'SHA-256' };
  const signature = await crypto.subtle.sign(algorithm, keys.privateKey, probe);
  if (!(await crypto.subtle.verify(algorithm, keys.publicKey, signature, probe)))
    throw new ConfigError('VAPID_PRIVATE_KEY does not belong to VAPID_PUBLIC_KEY');
  return keys;
}

/** Imports the VAPID keys once and returns a sender for one batch. Throws ConfigError. */
export async function createWebPushSender(config: VapidConfig): Promise<PushSender> {
  if (!/^(https:\/\/|mailto:)\S+$/.test(config.subject))
    throw new ConfigError('VAPID_SUBJECT must be an https: or mailto: URI');
  const vapidKeys = await importKeys(config);
  return async (target, payload) => {
    try {
      // A new application server key pair per message (RFC 8291 §2); ApplicationServer.new makes one.
      const server = await ApplicationServer.new({ contactInformation: config.subject, vapidKeys });
      await server
        .subscribe({ endpoint: target.endpoint, keys: target.keys })
        .pushTextMessage(payload, {
          ttl: target.ttl,
          urgency: target.urgency === 'high' ? Urgency.High : Urgency.Normal,
        });
      return PUSH_SUCCESS_STATUS;
    } catch (error) {
      if (!(error instanceof PushMessageError)) return null;
      await error.response.body?.cancel().catch(() => undefined);
      return error.response.status;
    }
  };
}

/**
 * The library calls the global fetch without options of ours, so index.ts wraps the global once:
 * redirects are never followed (a push service has no reason to redirect, and a redirect could
 * point anywhere) and every request is aborted after `timeoutMs`.
 */
export function guardFetch(inner: typeof fetch, timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('push_timeout')), timeoutMs);
    try {
      return await inner(input, { ...init, redirect: 'manual', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}
