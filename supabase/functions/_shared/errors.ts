import type { ErrorCode } from './contract.gen.ts';

const STATUS: { [code in ErrorCode]: number } = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_a_maps_link: 422,
  not_an_image: 422,
  not_a_tiktok_link: 422,
  video_unavailable: 422,
  video_too_large: 422,
  video_exists: 409,
  payload_too_large: 413,
  quota_exceeded: 429,
  internal: 500,
  ai_unavailable: 503,
};

/** Ends a request with one of the stable error codes of the contract. */
export class HttpError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'HttpError';
  }
}

/** A required setting is missing or malformed; the message names the variable, never its value. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function requireEnv(env: (name: string) => string | undefined, name: string): string {
  const value = env(name)?.trim();
  if (!value) throw new ConfigError(`missing environment variable ${name}`);
  return value;
}

export function jsonResponse(
  body: unknown,
  status: number,
  headers: { [name: string]: string },
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(code: ErrorCode, headers: { [name: string]: string }): Response {
  return jsonResponse({ error: code }, STATUS[code], headers);
}
