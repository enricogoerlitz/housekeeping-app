import { SpeechTokenReplySchema, type SpeechTokenReply } from '../_shared/contract.gen.ts';
import type { Deps } from '../_shared/deps.ts';
import { ConfigError, HttpError, requireEnv } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/http.ts';
import { fetchTextWithRetry } from '../_shared/retry.ts';
import { z } from 'zod';

/** Azure issues tokens valid for 10 minutes; the app renews one minute early. */
const TOKEN_LIFETIME_MS = 9 * 60_000;

async function issueToken(deps: Deps): Promise<SpeechTokenReply> {
  const region = requireEnv(deps.env, 'FOUNDRY_SPEECH_REGION');
  // The region becomes part of the host name the key is sent to.
  if (!/^[a-z0-9]{1,64}$/.test(region))
    throw new ConfigError('FOUNDRY_SPEECH_REGION is not a region name');
  const key = requireEnv(deps.env, 'FOUNDRY_API_KEY');
  const language = requireEnv(deps.env, 'FOUNDRY_STT_LANGUAGE');
  const model = deps.env('FOUNDRY_STT_MODEL')?.trim() || undefined;
  let reply: { status: number; text: string };
  try {
    reply = await fetchTextWithRetry(
      deps.fetch,
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key }, body: '' },
    );
  } catch {
    console.error('speech_token_unavailable');
    throw new HttpError('ai_unavailable');
  }
  if (reply.status !== 200) {
    console.error('speech_token_rejected', { status: reply.status });
    throw new HttpError('ai_unavailable');
  }
  const parsed = SpeechTokenReplySchema.safeParse({
    token: reply.text.trim(),
    region,
    expiresAt: new Date(deps.now().getTime() + TOKEN_LIFETIME_MS).toISOString(),
    language,
    ...(model ? { model } : {}),
  });
  if (!parsed.success) throw new HttpError('ai_unavailable');
  return parsed.data;
}

export function handler(request: Request, deps: Deps): Promise<Response> {
  return handleRequest(request, deps, {
    schema: z.strictObject({}),
    quota: 'speech',
    run: () => issueToken(deps),
  });
}
