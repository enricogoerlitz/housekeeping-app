// ai-recipe-draft (spec 0040, REQ-001 – REQ-003, REQ-006; ADR-0009, ADR-0016): "Mit KI
// ausfüllen". A sentence, up to 3 links and up to 4 photos become one recipe draft; the app shows
// it in the edit mode and nothing is saved before "Speichern". Signed-in members only, no quota
// (Entscheidung 2). Links are loaded with the SSRF guard (fetchPublic); page text, TikTok text,
// photos and household data reach the model as data only, the answer is a strict recipe schema,
// and the function only reads (select under the caller's RLS): no write, no command (AC-007).
// Spec 0055: `current` is a recipe to change by the wish (the edit mode's, or the last proposal);
// `webQuery` searches the web once (Serper, else Brave) and hands a few snippets and pages to the
// model as data, limited in number, size and time; new ingredients bring an area and a diet.
// Spec 0065: the photo of what it found comes back as `webPhotoUrl`, for „Original“.
// Spec 0064: a YouTube video gives its title, description and thumbnail (no download, no API key),
// and, when the description has no ingredients, the text of the one recipe page it links to.
import { RecipeDraftRequestSchema } from '../_shared/contract.gen.ts';
import type { Deps } from '../_shared/deps.ts';
import { handleRequest } from '../_shared/http.ts';
import { requireMember } from '../_shared/membership.ts';
import { draftRecipe, MAX_DRAFT_BODY_BYTES } from '../_shared/recipe-draft.ts';

export function handler(request: Request, deps: Deps): Promise<Response> {
  return handleRequest(request, deps, {
    schema: RecipeDraftRequestSchema,
    maxBodyBytes: MAX_DRAFT_BODY_BYTES,
    run: async ({ input, client }) => {
      await requireMember(client, input.householdId);
      return draftRecipe(deps, client, input);
    },
  });
}
