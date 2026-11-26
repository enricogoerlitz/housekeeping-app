import type { z } from 'zod';

import type { Deps } from './deps.ts';
import { HttpError, requireEnv } from './errors.ts';
import { UpstreamUnavailable, fetchTextWithRetry } from './retry.ts';
import { parseModelOutput, toStrictJsonSchema } from './strict-schema.ts';

/** One part of a message: text, or an image as a `data:image/jpeg;base64,…` URL (spec 0040). */
export type FoundryContentPart =
  { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string };

export interface FoundryRequest<T> {
  /** Name of the output schema, `[a-z_]`. */
  name: string;
  schema: z.ZodType<T>;
  instructions: string;
  input: { role: 'user'; content: string | FoundryContentPart[] }[];
  maxOutputTokens: number;
  /** Attempts and time budget (fetchTextWithRetry; defaults 3 and 20 s). */
  attempts?: number;
  budgetMs?: number;
}

function outputText(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { output_text: direct, output } = body as { output_text?: unknown; output?: unknown };
  if (typeof direct === 'string') return direct;
  if (!Array.isArray(output)) return undefined;
  return output
    .flatMap((item: { content?: unknown }) => (Array.isArray(item?.content) ? item.content : []))
    .filter((part: { type?: unknown }) => part?.type === 'output_text')
    .map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : ''))
    .join('');
}

/**
 * Calls the Foundry LLM (OpenAI-compatible Responses API) with strict structured output and
 * returns the answer validated against `schema`. Every failure — network, status, truncated or
 * off-contract output — is `ai_unavailable`. Logs carry only a reason and a status.
 */
export async function callFoundry<T>(
  deps: Pick<Deps, 'fetch' | 'env'>,
  request: FoundryRequest<T>,
): Promise<T> {
  const baseUrl = requireEnv(deps.env, 'FOUNDRY_OPENAI_BASE_URL').replace(/\/+$/, '');
  const apiKey = requireEnv(deps.env, 'FOUNDRY_API_KEY');
  const model = requireEnv(deps.env, 'FOUNDRY_LLM_DEPLOYMENT');
  let reply: { status: number; text: string };
  try {
    reply = await fetchTextWithRetry(
      deps.fetch,
      `${baseUrl}/responses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          model,
          instructions: request.instructions,
          input: request.input,
          text: {
            format: {
              type: 'json_schema',
              name: request.name,
              strict: true,
              schema: toStrictJsonSchema(request.schema),
            },
          },
          max_output_tokens: request.maxOutputTokens,
        }),
      },
      { attempts: request.attempts, budgetMs: request.budgetMs },
    );
  } catch (error) {
    const status = error instanceof UpstreamUnavailable ? error.status : undefined;
    console.error('foundry_unavailable', { status });
    throw new HttpError('ai_unavailable');
  }
  if (reply.status !== 200) {
    console.error('foundry_rejected', { status: reply.status });
    throw new HttpError('ai_unavailable');
  }
  let parsed: T | undefined;
  try {
    const text = outputText(JSON.parse(reply.text));
    parsed = text === undefined ? undefined : parseModelOutput(request.schema, JSON.parse(text));
  } catch {
    parsed = undefined;
  }
  if (parsed === undefined) {
    console.error('foundry_invalid_output');
    throw new HttpError('ai_unavailable');
  }
  return parsed;
}
