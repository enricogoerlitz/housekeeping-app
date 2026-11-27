// The image model (spec 0040, ADR-0016): FLUX.2-pro over the Black Forest Labs path of the
// Foundry resource, not /openai/v1. Proven in the recipe-crud skill (images.mjs) and the probe of
// 26.11.2026: about 8 s per image. The image comes back as base64 and is never stored here.
import type { Deps } from './deps.ts';
import { HttpError, requireEnv } from './errors.ts';
import { UpstreamUnavailable, fetchTextWithRetry } from './retry.ts';

/** Entscheidung 4: 45 s per image, one more try on 429/5xx. */
const BUDGET_MS = 45_000;
const ATTEMPTS = 2;
const SIZE = 1024;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export interface FluxRequest {
  prompt: string;
  /** "Aus diesem Foto": the photo to start from, JPEG as base64 without the data: prefix. */
  image?: string;
}

/** https://<resource>.services.ai.azure.com/…, the resource taken from FOUNDRY_OPENAI_BASE_URL. */
function fluxUrl(env: Deps['env']): string {
  const base = requireEnv(env, 'FOUNDRY_OPENAI_BASE_URL');
  let resource: string;
  try {
    resource = new URL(base).hostname.split('.')[0] ?? '';
  } catch {
    resource = '';
  }
  if (!/^[a-z0-9-]+$/i.test(resource)) throw new HttpError('internal');
  return `https://${resource}.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro?api-version=preview`;
}

function imageOf(text: string): string | undefined {
  try {
    const body = JSON.parse(text) as { data?: { b64_json?: unknown }[] };
    const image = body.data?.[0]?.b64_json;
    return typeof image === 'string' && image.length > 0 && BASE64.test(image) ? image : undefined;
  } catch {
    return undefined;
  }
}

const REASON_CODE = /^[A-Za-z0-9_.-]{1,64}$/;
const REASON_MESSAGE_CHARS = 200;

/**
 * Spec 0040, Entscheidung 9: why FLUX refused, from its JSON reply — only an error code and a
 * short message (Azure `error.code`/`error.message`, Black Forest Labs `detail`). A message that
 * repeats the prompt, the photo or the key is dropped; nothing else of the reply is logged.
 */
function rejectionReason(
  text: string,
  secrets: readonly string[],
): { code?: string; message?: string } {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof body !== 'object' || body === null) return {};
  const top = body as { error?: unknown; code?: unknown; message?: unknown; detail?: unknown };
  const error =
    typeof top.error === 'object' && top.error !== null
      ? (top.error as { code?: unknown; message?: unknown })
      : {};
  const code = [error.code, top.code].find((value) => typeof value === 'string');
  const raw = [error.message, top.error, top.message, top.detail].find(
    (value): value is string => typeof value === 'string',
  );
  const reason: { code?: string; message?: string } = {};
  if (typeof code === 'string' && REASON_CODE.test(code)) reason.code = code;
  if (raw !== undefined) {
    const message = Array.from(raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim())
      .slice(0, REASON_MESSAGE_CHARS)
      .join('');
    if (message && !secrets.some((secret) => secret !== '' && raw.includes(secret)))
      reason.message = message;
  }
  return reason;
}

/**
 * One image of 1024 × 1024 px as base64 JPEG. Every failure — network, status, refusal, an answer
 * without an image — is `ai_unavailable`. Logs carry only a reason, a status and, for a refusal,
 * its error code and short message (Entscheidung 9).
 */
export async function callFlux(
  deps: Pick<Deps, 'fetch' | 'env'>,
  request: FluxRequest,
  options: { budgetMs?: number; attempts?: number } = {},
): Promise<string> {
  const model = requireEnv(deps.env, 'FOUNDRY_IMAGE_DEPLOYMENT');
  const apiKey = requireEnv(deps.env, 'FOUNDRY_API_KEY');
  const url = fluxUrl(deps.env);
  const body: { [key: string]: unknown } = {
    model,
    prompt: request.prompt,
    width: SIZE,
    height: SIZE,
    output_format: 'jpeg',
  };
  if (request.image !== undefined) body.input_image = request.image;
  let reply: { status: number; text: string };
  try {
    reply = await fetchTextWithRetry(
      deps.fetch,
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify(body),
      },
      { budgetMs: options.budgetMs ?? BUDGET_MS, attempts: options.attempts ?? ATTEMPTS },
    );
  } catch (error) {
    const status = error instanceof UpstreamUnavailable ? error.status : undefined;
    console.error('flux_unavailable', { status });
    throw new HttpError('ai_unavailable');
  }
  if (reply.status !== 200) {
    const secrets = [request.prompt, request.image ?? '', apiKey];
    console.error('flux_rejected', {
      status: reply.status,
      ...rejectionReason(reply.text, secrets),
    });
    throw new HttpError('ai_unavailable');
  }
  const image = imageOf(reply.text);
  if (image === undefined) {
    console.error('flux_invalid_output');
    throw new HttpError('ai_unavailable');
  }
  return image;
}
