import { describe, expect, it } from 'vitest';

import { offersVideo } from './recipe-video';
import type { Recipe } from './types';

const pasta = {
  kind: 'recipe',
  links: [{ url: 'https://vm.tiktok.com/ZGdXoJ8Ay/' }],
} as const satisfies Pick<Recipe, 'kind' | 'links'>;

describe('offersVideo (spec 0043, REQ-001)', () => {
  it('AC-001: a TikTok link of a recipe without a video offers "Video speichern"', () => {
    expect(offersVideo(pasta, 'https://vm.tiktok.com/ZGdXoJ8Ay/')).toBe(true);
    expect(offersVideo(pasta, 'https://www.tiktok.com/@jacobs_lunch/video/76865129')).toBe(true);
  });

  it('AC-004: a link to another site offers nothing', () => {
    for (const url of [
      'https://www.chefkoch.de/rezepte/1',
      'https://tiktok.com.evil.example/x',
      'http://vm.tiktok.com/ZGdXoJ8Ay/',
      'kein link',
    ])
      expect(offersVideo(pasta, url)).toBe(false);
  });

  it('one video per recipe; a collection has none', () => {
    expect(offersVideo({ ...pasta, videoPath: 'h/recipes/r/v.mp4' }, pasta.links[0].url)).toBe(
      false,
    );
    expect(offersVideo({ ...pasta, kind: 'collection' }, pasta.links[0].url)).toBe(false);
  });
});
