// fetch-video (spec 0043, REQ-001, Entscheidung 3): "Video speichern" at a TikTok link of a recipe.
// The server loads the video (only TikTok and its CDNs, through fetchPublic: ADR-0016), uploads it
// into household-videos with the caller's own key (the bucket's policies decide, no server key)
// and sets the recipe's video_path through apply_changes, also as the caller. Signed-in members
// only, no quota (Enrico, 26.11.). Answer { videoPath }; errors { error }: not_a_tiktok_link
// (the address is no TikTok link of this recipe), video_unavailable, video_too_large,
// video_exists, forbidden. Nothing about the link or the video is logged.
import { FetchVideoRequestSchema, type FetchVideoReply } from '../_shared/contract.gen.ts';
import type { Deps, UserClient } from '../_shared/deps.ts';
import { HttpError } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/http.ts';
import { requireMember } from '../_shared/membership.ts';
import { isTikTokHost, loadTikTokVideo, TikTokVideoError } from '../_shared/tiktok.ts';

const BUCKET = 'household-videos';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface VideoRecipe {
  id: string;
  householdId: string;
  links: string[];
  videoPath: string | null;
}

/** The recipe under the caller's RLS; undefined when she cannot see it or it is a collection. */
async function recipeOf(
  client: UserClient,
  householdId: string,
  recipeId: string,
): Promise<VideoRecipe | undefined> {
  const { data, error } = await client
    .from('recipes')
    .select('id, household_id, kind, links, video_path')
    .eq('household_id', householdId)
    .eq('id', recipeId)
    .limit(1);
  if (error) throw new Error('recipe_lookup_failed');
  const row = Array.isArray(data)
    ? (data[0] as { [column: string]: unknown } | undefined)
    : undefined;
  if (!row || row.kind !== 'recipe') return undefined;
  const id = String(row.id);
  const household = String(row.household_id);
  // The object name must match the bucket's policy and recipes_video_path_valid exactly.
  if (!UUID.test(id) || !UUID.test(household)) return undefined;
  const links = Array.isArray(row.links)
    ? row.links.flatMap((link: unknown) =>
        typeof link === 'object' &&
        link !== null &&
        typeof (link as { url?: unknown }).url === 'string'
          ? [(link as { url: string }).url]
          : [],
      )
    : [];
  return {
    id,
    householdId: household,
    links,
    videoPath: typeof row.video_path === 'string' ? row.video_path : null,
  };
}

function isTikTokLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && isTikTokHost(parsed.hostname);
  } catch {
    return false;
  }
}

async function loadVideo(deps: Deps, url: string): Promise<Uint8Array> {
  try {
    return await loadTikTokVideo(url, deps);
  } catch (error) {
    if (error instanceof TikTokVideoError)
      throw new HttpError(error.reason === 'too_large' ? 'video_too_large' : 'video_unavailable');
    throw error;
  }
}

export function handler(request: Request, deps: Deps): Promise<Response> {
  return handleRequest(request, deps, {
    schema: FetchVideoRequestSchema,
    run: async ({ input, client }): Promise<FetchVideoReply> => {
      await requireMember(client, input.householdId);
      const recipe = await recipeOf(client, input.householdId, input.recipeId);
      if (!recipe) throw new HttpError('forbidden');
      // AC-004: only a TikTok link the recipe has; nothing is fetched for anything else.
      if (!isTikTokLink(input.url) || !recipe.links.includes(input.url))
        throw new HttpError('not_a_tiktok_link');
      if (recipe.videoPath) throw new HttpError('video_exists');

      const bytes = await loadVideo(deps, input.url);
      const videoPath = `${recipe.householdId}/recipes/${recipe.id}/${crypto.randomUUID()}.mp4`;
      const uploaded = await client.storage.upload(BUCKET, videoPath, bytes, 'video/mp4');
      if (uploaded.error) {
        if (uploaded.error.status === 413) throw new HttpError('video_too_large');
        throw new Error('video_upload_failed');
      }
      const { error } = await client.rpc('apply_changes', {
        p_household_id: recipe.householdId,
        p_ops: [
          { kind: 'patch', table: 'recipes', id: recipe.id, changes: { video_path: videoPath } },
        ],
      });
      if (error) {
        // No row names the file: it goes again at once (else the nightly sweep takes it).
        await client.storage.remove(BUCKET, [videoPath]).catch(() => undefined);
        throw new Error('video_path_refused');
      }
      return { videoPath };
    },
  });
}
