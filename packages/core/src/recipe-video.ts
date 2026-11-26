import { isTikTokUrl } from './recipe-draft';
import type { Recipe } from './types';

/**
 * "Video speichern" at a link (spec 0043, REQ-001): an https TikTok link (also a short link) of a
 * recipe that has no video yet; never for a collection, never for another site (AC-004). The
 * server checks the same again.
 */
export function offersVideo(recipe: Pick<Recipe, 'kind' | 'videoPath'>, url: string): boolean {
  return (
    recipe.kind === 'recipe' &&
    !recipe.videoPath &&
    url.toLowerCase().startsWith('https://') &&
    isTikTokUrl(url)
  );
}
