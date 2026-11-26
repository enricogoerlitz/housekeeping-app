// ai-image (spec 0040, REQ-004, REQ-005; ADR-0016): the tab "KI" of the photo window and "Foto
// generieren". Spec 0052: one call to the language model turns the wish and its context into
// three prompts; then three FLUX.2-pro calls in parallel give three variants as base64 JPEG.
// Nothing is stored here — only "Übernehmen" in the app uploads the chosen one through the normal
// photo path. "Aus diesem Foto" sends the entry's photo (at most 1024 px) as the image to start
// from. Signed-in members only, no quota (Entscheidung 2): the limit is the deployment's limit in
// Azure.
import {
  AiImageRequestSchema,
  IMAGE_VARIANTS,
  type AiImageReply,
} from '../_shared/contract.gen.ts';
import type { Deps } from '../_shared/deps.ts';
import { HttpError } from '../_shared/errors.ts';
import { callFlux } from '../_shared/flux.ts';
import { callFoundry } from '../_shared/foundry.ts';
import { handleRequest } from '../_shared/http.ts';
import { requireMember } from '../_shared/membership.ts';
import {
  ENHANCE_INSTRUCTIONS,
  ImagePromptsSchema,
  directPrompt,
  enhancementInput,
  fluxPrompts,
  type AiImageInput,
} from './prompts.ts';

/** "Aus diesem Foto" sends the photo in the body (Entscheidung 4). */
const MAX_IMAGE_BODY_BYTES = 6 * 1024 * 1024;

/** AC-012: the answer comes after 30 s at the latest once at least one variant is there. */
const ANSWER_BY_MS = 30_000;

/**
 * Every call settled, or — when at least one variant is ready — as many as are settled after
 * ANSWER_BY_MS (the rest count as failed, AC-014). A single call still has its own 45 s
 * (Entscheidung 4), so without any variant the answer waits for them.
 */
async function settledOrEnough<T>(
  calls: Promise<T>[],
  started: number,
): Promise<(PromiseSettledResult<T> | undefined)[]> {
  const results: (PromiseSettledResult<T> | undefined)[] = calls.map(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const enough = new Promise<void>((resolve) => {
    const firstSuccess = () => {
      if (timer !== undefined) return;
      timer = setTimeout(resolve, Math.max(0, ANSWER_BY_MS - (Date.now() - started)));
    };
    calls.forEach((call, index) =>
      call.then(
        (value) => {
          results[index] = { status: 'fulfilled', value };
          firstSuccess();
        },
        (reason: unknown) => {
          results[index] = { status: 'rejected', reason };
        },
      ),
    );
  });
  try {
    await Promise.race([Promise.allSettled(calls), enough]);
  } finally {
    clearTimeout(timer);
  }
  return results;
}

/**
 * Spec 0052, Entscheidung 1: one attempt, a short deadline, a small answer, no reasoning (the
 * probe: 2.1–2.9 s without, 2.8–3.9 s with the default effort, same quality; ≈ 150 tokens out).
 */
const ENHANCE_BUDGET_MS = 6_000;
const ENHANCE_MAX_OUTPUT_TOKENS = 600;

/**
 * REQ-001: three prompts from one call to the language model; REQ-002: on any failure the direct
 * prompt of spec 0040 for all three, so the enhancement never fails a request.
 */
async function prompts(deps: Deps, input: AiImageInput): Promise<string[]> {
  try {
    const answer = await callFoundry(deps, {
      name: 'image_prompts',
      schema: ImagePromptsSchema,
      instructions: ENHANCE_INSTRUCTIONS,
      input: enhancementInput(input),
      maxOutputTokens: ENHANCE_MAX_OUTPUT_TOKENS,
      attempts: 1,
      budgetMs: ENHANCE_BUDGET_MS,
      reasoningEffort: 'none',
    });
    return fluxPrompts(answer);
  } catch {
    console.error('image_prompt_fallback');
    return Array.from({ length: IMAGE_VARIANTS }, () => directPrompt(input));
  }
}

async function variants(deps: Deps, input: AiImageInput): Promise<AiImageReply> {
  // AC-007: the 30 s of AC-012 (spec 0040) count from the request, the enhancement included.
  const started = Date.now();
  const image = input.image?.slice(input.image.indexOf(',') + 1);
  const calls = (await prompts(deps, input)).map((prompt) =>
    callFlux(deps, image === undefined ? { prompt } : { prompt, image }),
  );
  const settled = await settledOrEnough(calls, started);
  const images = settled.flatMap((result) =>
    result?.status === 'fulfilled' ? [result.value] : [],
  );
  // A missing setting is a configuration error (500), not an unavailable model.
  const config = settled.find(
    (result) => result?.status === 'rejected' && !(result.reason instanceof HttpError),
  );
  if (images.length === 0) {
    if (config?.status === 'rejected') throw config.reason;
    throw new HttpError('ai_unavailable');
  }
  return { images, failed: IMAGE_VARIANTS - images.length };
}

export function handler(request: Request, deps: Deps): Promise<Response> {
  return handleRequest(request, deps, {
    schema: AiImageRequestSchema,
    maxBodyBytes: MAX_IMAGE_BODY_BYTES,
    run: async ({ input, client }) => {
      await requireMember(client, input.householdId);
      return variants(deps, input);
    },
  });
}
