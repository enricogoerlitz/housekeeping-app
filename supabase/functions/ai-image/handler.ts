// ai-image (spec 0040, REQ-004, REQ-005; ADR-0016): the tab "KI" of the photo window and "Foto
// generieren". Three FLUX.2-pro calls in parallel give three variants as base64 JPEG; nothing is
// stored here — only "Übernehmen" in the app uploads the chosen one through the normal photo path.
// "Aus diesem Foto" sends the entry's photo (at most 1024 px) as the image to start from.
// Signed-in members only, no quota (Entscheidung 2): the limit is the deployment's limit in Azure.
import {
  AiImageRequestSchema,
  IMAGE_VARIANTS,
  type AiImageReply,
  type ImageStyle,
} from '../_shared/contract.gen.ts';
import type { Deps } from '../_shared/deps.ts';
import { HttpError } from '../_shared/errors.ts';
import { callFlux } from '../_shared/flux.ts';
import { handleRequest } from '../_shared/http.ts';
import { requireMember } from '../_shared/membership.ts';
import type { z } from 'zod';

/** "Aus diesem Foto" sends the photo in the body (Entscheidung 4). */
export const MAX_IMAGE_BODY_BYTES = 6 * 1024 * 1024;

// Recipes, restaurants and activities share the window, so the look is photographic, not food only.
const STYLE =
  'Professional photograph, natural soft daylight, true-to-life colours, shallow depth of field, ' +
  'appetizing when it shows food, square composition with the subject centred, ' +
  'no text, no letters, no logos, no watermarks, no people, no hands.';

const EDIT =
  'Turn this photo into a professional photograph of the same subject. Keep the dish (or place), ' +
  'its ingredients, portions and arrangement recognisable. Remove any text, captions, app ' +
  'overlays, icons, watermarks, faces and hands, and improve light, colour and background. ' +
  'The person asks for:';

const STYLE_PHRASES: { [style in ImageStyle]: string } = {
  glossy: 'Glossy high-end magazine look.',
  rustic: 'Rustic wooden table and linen, homely.',
  top: 'Shot from directly above (flat lay).',
  close: 'Close-up macro shot, the subject fills the frame.',
  bright: 'Bright, airy, high-key light.',
};

export function imagePrompt(input: z.infer<typeof AiImageRequestSchema>): string {
  const styles = (input.styles ?? []).map((style) => STYLE_PHRASES[style]).join(' ');
  const subject = input.image ? `${EDIT} ${input.prompt}.` : `Subject: ${input.prompt}.`;
  return [subject, styles, STYLE].filter(Boolean).join(' ');
}

async function variants(
  deps: Deps,
  input: z.infer<typeof AiImageRequestSchema>,
): Promise<AiImageReply> {
  const prompt = imagePrompt(input);
  const image = input.image?.slice(input.image.indexOf(',') + 1);
  const settled = await Promise.allSettled(
    Array.from({ length: IMAGE_VARIANTS }, () =>
      callFlux(deps, image === undefined ? { prompt } : { prompt, image }),
    ),
  );
  const images = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  // A missing setting is a configuration error (500), not an unavailable model.
  const config = settled.find(
    (result) => result.status === 'rejected' && !(result.reason instanceof HttpError),
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
