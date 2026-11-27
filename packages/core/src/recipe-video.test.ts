import { describe, expect, it } from 'vitest';

import {
  galleryItems,
  offersVideo,
  videoLabel,
  withoutVideo,
  withVideoPoster,
} from './recipe-video';
import type { Recipe, RecipeVideo } from './types';

const first = 'https://vm.tiktok.com/ZGdXoJ8Ay/';
const second = 'https://www.tiktok.com/@koch/video/1';
const pasta = {
  kind: 'recipe',
  links: [{ url: first }, { url: second }],
  videos: [],
} as const satisfies Pick<Recipe, 'kind' | 'links' | 'videos'>;
const v1: RecipeVideo = { path: 'h/recipes/r/1.mp4', url: first };
const v2: RecipeVideo = { path: 'h/recipes/r/2.mp4', url: second };

describe('offersVideo (spec 0043 REQ-001, spec 0046 REQ-002)', () => {
  it('AC-005: a TikTok link without its video offers the save button', () => {
    expect(offersVideo(pasta, first)).toBe(true);
    expect(offersVideo(pasta, 'https://www.tiktok.com/@jacobs_lunch/video/76865129')).toBe(true);
  });

  it('AC-004 (0043): a link to another site offers nothing', () => {
    for (const url of [
      'https://www.chefkoch.de/rezepte/1',
      'https://tiktok.com.evil.example/x',
      'http://vm.tiktok.com/ZGdXoJ8Ay/',
      'kein link',
    ])
      expect(offersVideo(pasta, url)).toBe(false);
  });

  it('AC-006: a link with its video offers nothing, the other link still does', () => {
    const saved = { ...pasta, videos: [v1] };
    expect(offersVideo(saved, first)).toBe(false);
    expect(offersVideo(saved, second)).toBe(true);
  });

  it('AC-004: at most 10 videos; a collection has none', () => {
    const full = {
      ...pasta,
      videos: Array.from({ length: 10 }, (_, n) => ({ path: `h/recipes/r/${n}.mp4` })),
    };
    expect(offersVideo(full, first)).toBe(false);
    expect(offersVideo({ ...pasta, kind: 'collection' }, first)).toBe(false);
  });
});

describe('galleryItems (spec 0046, REQ-003)', () => {
  it('AC-009: the photo first, then the videos in their order', () => {
    expect(galleryItems({ videos: [v1, v2] }, true)).toEqual([
      { kind: 'photo', key: 'photo' },
      { kind: 'video', key: v1.path, video: v1, index: 0 },
      { kind: 'video', key: v2.path, video: v2, index: 1 },
    ]);
  });

  it('AC-010: without a photo the gallery starts with the first video', () => {
    expect(galleryItems({ videos: [v1] }, false)).toEqual([
      { kind: 'video', key: v1.path, video: v1, index: 0 },
    ]);
  });

  it('AC-011: neither photo nor video: the photo (its placeholder) as before', () => {
    expect(galleryItems({ videos: [] }, false)).toEqual([{ kind: 'photo', key: 'photo' }]);
    expect(galleryItems({ videos: [] }, true)).toEqual([{ kind: 'photo', key: 'photo' }]);
  });
});

describe('the list of videos (spec 0046)', () => {
  it('AC-017: removing one keeps the others in order', () => {
    expect(withoutVideo([v1, v2], v1.path)).toEqual([v2]);
    expect(withoutVideo([v1, v2], 'other')).toEqual([v1, v2]);
  });

  it('AC-012: the poster goes to its video only, and never replaces one', () => {
    expect(withVideoPoster([v1, v2], v2.path, 'h/recipes/r/p.jpg')).toEqual([
      v1,
      { ...v2, poster: 'h/recipes/r/p.jpg' },
    ]);
    const withPoster = { ...v1, poster: 'h/recipes/r/old.jpg' };
    expect(withVideoPoster([withPoster], v1.path, 'h/recipes/r/new.jpg')).toEqual([withPoster]);
  });

  it('AC-016: one video is "Video", several are numbered', () => {
    expect(videoLabel(0, 1)).toBe('Video');
    expect(videoLabel(0, 2)).toBe('Video 1');
    expect(videoLabel(1, 2)).toBe('Video 2');
  });
});
