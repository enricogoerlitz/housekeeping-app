// fetch-video (spec 0043, REQ-001, Entscheidung 3; spec 0046): "Video speichern" at a TikTok link
// of a recipe. The server loads the video (only TikTok and its CDNs, through fetchPublic:
// ADR-0016), uploads it into household-videos with the caller's own key (the bucket's policies
// decide, no server key) and appends it to the recipe's videos through add_recipe_video, also as
// the caller. Signed-in members only, no quota (Enrico, 26.11.). Answer { videoPath, coverUrl? }
// (the cover's https address on TikTok's hosts, for the poster the app stores); errors { error }:
// not_a_tiktok_link (the address is no TikTok link of this recipe), video_unavailable,
// video_too_large, video_exists (that link's video is there, or the recipe has 10), forbidden.
// Nothing about the link or the video is logged.
import { FetchVideoRequestSchema, type FetchVideoReply } from '../_shared/contract.gen.ts';
import type { Deps, UserClient } from '../_shared/deps.ts';
import { HttpError } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/http.ts';
import { requireMember } from '../_shared/membership.ts';
import {
  isTikTokHost,
  loadTikTokVideo,
  TikTokVideoError,
  type TikTokVideo,
} from '../_shared/tiktok.ts';

const BUCKET = 'household-videos';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** recipes_videos_valid (spec 0046): at most 10 videos per recipe. */
const MAX_VIDEOS = 10;

interface VideoRecipe {
  id: string;
  householdId: string;
  links: string[];
  /** The source links of its videos, and how many it has. */
  videoUrls: string[];
  videoCount: number;
}

/** The recipe under the caller's RLS; undefined when she cannot see it or it is a collection. */
async function recipeOf(
  client: UserClient,
  householdId: string,
  recipeId: string,
): Promise<VideoRecipe | undefined> {
  const { data, error } = await client
    .from('recipes')
    .select('id, household_id, kind, links, videos')
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
  // The object name must match the bucket's policy and recipes_videos_valid exactly.
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
  const videos: unknown[] = Array.isArray(row.videos) ? row.videos : [];
  return {
    id,
    householdId: household,
    links,
    videoUrls: videos.flatMap((video) =>
      typeof video === 'object' &&
      video !== null &&
      typeof (video as { url?: unknown }).url === 'string'
        ? [(video as { url: string }).url]
        : [],
    ),
    videoCount: videos.length,
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

async function loadVideo(deps: Deps, url: string): Promise<TikTokVideo> {
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
      // A recipe id is a uuid; anything else names no recipe (and would make PostgREST fail).
      if (!UUID.test(input.recipeId)) throw new HttpError('forbidden');
      const recipe = await recipeOf(client, input.householdId, input.recipeId);
      if (!recipe) throw new HttpError('forbidden');
      // AC-004: only a TikTok link the recipe has; nothing is fetched for anything else.
      if (!isTikTokLink(input.url) || !recipe.links.includes(input.url))
        throw new HttpError('not_a_tiktok_link');
      if (recipe.videoUrls.includes(input.url) || recipe.videoCount >= MAX_VIDEOS)
        throw new HttpError('video_exists');

      const { bytes, coverUrl } = await loadVideo(deps, input.url);
      const videoPath = `${recipe.householdId}/recipes/${recipe.id}/${crypto.randomUUID()}.mp4`;
      const uploaded = await client.storage.upload(BUCKET, videoPath, bytes, 'video/mp4');
      if (uploaded.error) {
        if (uploaded.error.status === 413) throw new HttpError('video_too_large');
        throw new Error('video_upload_failed');
      }
      const { data, error } = await client.rpc('add_recipe_video', {
        p_household_id: recipe.householdId,
        p_recipe_id: recipe.id,
        p_video: { path: videoPath, url: input.url },
      });
      if (error || data !== true) {
        // No row names the file: it goes again at once (else the nightly sweep takes it).
        await client.storage.remove(BUCKET, [videoPath]).catch(() => undefined);
        // false: the same link's video was added meanwhile (a second tap, another device).
        if (!error && data === false) throw new HttpError('video_exists');
        throw new Error('video_refused');
      }
      return coverUrl ? { videoPath, coverUrl } : { videoPath };
    },
  });
}
