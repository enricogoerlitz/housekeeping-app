import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PublicFetchDeps } from './fetch-public.ts';
import {
  descriptionRecipeLink,
  hasIngredientPart,
  readYouTube,
  youtubeFetchHost,
  youtubeVideo,
} from './youtube.ts';

// Hand-made answers with the JSON paths of real YouTube pages (PoC 27.11.2026,
// tmp/review-0004/youtube-poc): the watch page's `ytInitialPlayerResponse.videoDetails` and the
// oEmbed answer. No test reaches the network.
const ID = 'gkgJAPBrwT8';
const WATCH = `https://www.youtube.com/watch?v=${ID}`;
const PAGE = `${WATCH}&hl=de`;
const OEMBED = `https://www.youtube.com/oembed?url=${encodeURIComponent(WATCH)}&format=json`;
const TITLE = 'Lasagne Bolognese - Das Original! | Chefkoch.de';
const MAXRES = `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`;
const HQ = `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`;
const RECIPE = 'http://www.chefkoch.de/rezepte/1112181217260303/Lasagne-Bolognese.html';
// 1025 characters like the Chefkoch video of the PoC, with braces and quotes that a naive scan of
// the page's JSON would stumble over.
const DESCRIPTION = `Unser Rezept: ${RECIPE}\nDie "echte" Lasagne {aus Bologna}};var x\n`.padEnd(
  1025,
  'x',
);

function details(extra: { [key: string]: unknown } = {}) {
  return {
    videoId: ID,
    title: TITLE,
    shortDescription: DESCRIPTION,
    thumbnail: {
      thumbnails: [
        { url: `https://i.ytimg.com/vi/${ID}/default.jpg`, width: 120, height: 90 },
        { url: MAXRES, width: 1920, height: 1080 },
        { url: HQ, width: 480, height: 360 },
      ],
    },
    ...extra,
  };
}

function watchPage(videoDetails: unknown): string {
  const player = { responseContext: {}, videoDetails };
  return `<html><head><script nonce="n">var ytInitialPlayerResponse = ${JSON.stringify(player)};var meta = document.createElement('meta');</script></head><body></body></html>`;
}

const html = (body: string) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
const OEMBED_REPLY = { title: TITLE, author_name: 'Chefkoch', thumbnail_url: HQ };

function deps(routes: { [url: string]: () => Response | Promise<Response> }): PublicFetchDeps & {
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
} {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const route = routes[String(input)];
    if (!route) throw new TypeError(`unexpected fetch ${String(input)}`);
    return route();
  });
  return { fetch: fetchMock, fetchMock, resolveDns: async () => ['142.250.185.78'] };
}

const video = (link: string) => {
  const found = youtubeVideo(link);
  if (!found) throw new Error(`no video: ${link}`);
  return found;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('youtubeVideo (REQ-001)', () => {
  it('AC-001: youtu.be with a tracking parameter gives the ID and the watch address', () => {
    expect(youtubeVideo('https://youtu.be/gkgJAPBrwT8?si=x')).toEqual({ id: ID, url: WATCH });
  });

  it('AC-002: a Short is a YouTube video', () => {
    expect(youtubeVideo('https://www.youtube.com/shorts/SPQiIhwEtzo')).toEqual({
      id: 'SPQiIhwEtzo',
      url: 'https://www.youtube.com/watch?v=SPQiIhwEtzo',
    });
  });

  it('AC-001: watch links on www., m. and without subdomain, with more parameters', () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}&t=42s`,
      `https://youtube.com/watch?feature=share&v=${ID}`,
      `https://www.youtube.com/shorts/${ID}?feature=share`,
      `https://YouTu.be/${ID}`,
    ])
      expect(youtubeVideo(link)).toEqual({ id: ID, url: WATCH });
  });

  it('AC-003: channels, playlists without v=, YouTube Music and look-alikes are no video', () => {
    for (const link of [
      'https://www.youtube.com/@chefkoch',
      'https://www.youtube.com/playlist?list=PL1234567890',
      'https://www.youtube.com/watch?list=PL1234567890',
      `https://music.youtube.com/watch?v=${ID}`,
      `https://www.youtube.com.evil.example/watch?v=${ID}`,
      `https://notyoutube.com/watch?v=${ID}`,
      'https://www.youtube.com/watch?v=too-short',
      `https://youtu.be/${ID}/extra`,
      'https://youtu.be/',
      'kein link',
    ])
      expect(youtubeVideo(link), link).toBeUndefined();
  });

  it('the fetches stay on youtube.com', () => {
    for (const host of ['www.youtube.com', 'consent.youtube.com', 'youtube.com'])
      expect(youtubeFetchHost(host)).toBe(true);
    for (const host of ['youtube.com.evil.example', 'example.org', 'evilyoutube.com'])
      expect(youtubeFetchHost(host)).toBe(false);
  });
});

describe('readYouTube (REQ-002)', () => {
  it('AC-004: title and the whole description reach the text, the largest thumbnail is the cover', async () => {
    const d = deps({ [PAGE]: () => html(watchPage(details())) });
    const result = await readYouTube(video('https://youtu.be/gkgJAPBrwT8?si=x'), d);
    expect(result.resolvedUrl).toBe(WATCH);
    expect(result.coverUrl).toBe(MAXRES);
    expect(result.text).toBe(`Titel: ${TITLE}\nBeschreibung: ${DESCRIPTION.trim()}`);
    expect(result.descriptionUnread).toBeUndefined();
    expect(d.fetchMock.mock.calls.map(([url]) => String(url))).toEqual([PAGE]);
  });

  it('Entscheidung 3: the page is asked in German, with the consent cookie, at most 2.5 MB', async () => {
    const d = deps({ [PAGE]: () => html(watchPage(details())) });
    await readYouTube(video(WATCH), d);
    const headers = new Headers(d.fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('accept-language')).toMatch(/^de/);
    expect(headers.get('cookie')).toContain('SOCS=');
    const big = deps({
      [PAGE]: () =>
        new Response('x', {
          status: 200,
          headers: { 'content-type': 'text/html', 'content-length': String(2.5 * 1024 * 1024 + 1) },
        }),
      [OEMBED]: () => json(OEMBED_REPLY),
    });
    expect((await readYouTube(video(WATCH), big)).text).toBe(`Titel: ${TITLE}`);
  });

  it('Entscheidung 3: the description reaches the model with at most 6000 characters', async () => {
    const long = 'Ä'.repeat(7000);
    const d = deps({ [PAGE]: () => html(watchPage(details({ shortDescription: long }))) });
    const result = await readYouTube(video(WATCH), d);
    expect(result.text).toBe(`Titel: ${TITLE}\nBeschreibung: ${'Ä'.repeat(6000)}`);
  });

  it('AC-005: a page without videoDetails (consent page) takes title and thumbnail from oEmbed', async () => {
    const d = deps({
      [PAGE]: () => html('<html><form action="https://consent.youtube.com/save"></form></html>'),
      [OEMBED]: () => json(OEMBED_REPLY),
    });
    const result = await readYouTube(video(WATCH), d);
    // AC-011: only the title; the description counts as unread.
    expect(result).toEqual({
      resolvedUrl: WATCH,
      text: `Titel: ${TITLE}`,
      coverUrl: HQ,
      descriptionUnread: true,
    });
  });

  it('AC-005: a redirect to the consent page, broken JSON or another video also fall back', async () => {
    for (const page of [
      () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://consent.youtube.com/m?continue=x' },
        }),
      () => html('<script>var ytInitialPlayerResponse = {"videoDetails": {"title": "x"</script>'),
      () => html(watchPage(details({ videoId: 'dQw4w9WgXcQ' }))),
      () => html(watchPage(details({ title: '' }))),
    ]) {
      const d = deps({
        [PAGE]: page,
        'https://consent.youtube.com/m?continue=x': () => html('<html>Bevor Sie fortfahren</html>'),
        [OEMBED]: () => json(OEMBED_REPLY),
      });
      expect(await readYouTube(video(WATCH), d)).toEqual({
        resolvedUrl: WATCH,
        text: `Titel: ${TITLE}`,
        coverUrl: HQ,
        descriptionUnread: true,
      });
    }
  });

  it('AC-005: a page that does not answer within 8 s falls back to oEmbed', async () => {
    vi.useFakeTimers();
    const d = deps({
      [PAGE]: () => new Promise<Response>(() => undefined),
      [OEMBED]: () => json(OEMBED_REPLY),
    });
    const pending = readYouTube(video(WATCH), d);
    await vi.advanceTimersByTimeAsync(8_000);
    expect((await pending).text).toBe(`Titel: ${TITLE}`);
  });

  it('AC-006: neither page nor oEmbed: no text, but the normalized address is kept', async () => {
    vi.useFakeTimers();
    const d = deps({
      [PAGE]: () => new Response('', { status: 429 }),
      [OEMBED]: () => new Promise<Response>(() => undefined),
    });
    const pending = readYouTube(video('https://youtu.be/gkgJAPBrwT8'), d);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await pending).toEqual({ resolvedUrl: WATCH, text: '', descriptionUnread: true });
  });

  it('a page without a thumbnail takes the one of oEmbed; foreign image hosts are not taken', async () => {
    const d = deps({
      [PAGE]: () =>
        html(
          watchPage(
            details({
              thumbnail: { thumbnails: [{ url: 'https://evil.example/x.jpg', width: 9999 }] },
            }),
          ),
        ),
      [OEMBED]: () => json(OEMBED_REPLY),
    });
    const result = await readYouTube(video(WATCH), d);
    expect(result.coverUrl).toBe(HQ);
    expect(result.text).toContain('Beschreibung: ');
    const none = deps({
      [PAGE]: () => html('<html></html>'),
      [OEMBED]: () => json({ title: TITLE, thumbnail_url: 'http://i.ytimg.com/vi/x/hq.jpg' }),
    });
    expect((await readYouTube(video(WATCH), none)).coverUrl).toBeUndefined();
  });
});

describe('the recipe link of a description (REQ-003)', () => {
  it('AC-007: a description without ingredients gives its recipe link, as https', async () => {
    expect(descriptionRecipeLink(DESCRIPTION)).toBe(RECIPE.replace('http://', 'https://'));
    const d = deps({ [PAGE]: () => html(watchPage(details())) });
    expect((await readYouTube(video(WATCH), d)).recipeLink).toBe(
      'https://www.chefkoch.de/rezepte/1112181217260303/Lasagne-Bolognese.html',
    );
  });

  it('AC-008: a description with ingredients gives no link', async () => {
    const withList = `Zutaten:\n500 g Hackfleisch\n2 EL Olivenöl\n1 Zwiebel\nMehr: ${RECIPE}`;
    expect(hasIngredientPart(withList)).toBe(true);
    expect(descriptionRecipeLink(withList)).toBeUndefined();
    const d = deps({
      [PAGE]: () => html(watchPage(details({ shortDescription: withList }))),
    });
    expect((await readYouTube(video(WATCH), d)).recipeLink).toBeUndefined();
  });

  it('AC-008: a heading "Zutaten" or three lines with amounts count as an ingredient part', () => {
    expect(hasIngredientPart('Lecker!\n🛒 Zutaten für 4 Personen:\n- Nudeln')).toBe(true);
    expect(hasIngredientPart('Ingredients\n• pasta')).toBe(true);
    expect(hasIngredientPart('- 400 g Spaghetti\n- ½ TL Salz\n- 2 Knoblauchzehen')).toBe(true);
    // Timestamps, prose and a mention of "Zutaten" mid-sentence are no ingredient part.
    expect(
      hasIngredientPart(
        '0:00 Intro\n1:20 Soße\n5:40 Schichten\nAlle Zutaten findet ihr auf unserer Seite',
      ),
    ).toBe(false);
    expect(hasIngredientPart('2 Freunde kochen\nfür euch')).toBe(false);
  });

  it('AC-007: only a recipe page: shops, socials, short links and YouTube are not loaded', () => {
    expect(
      descriptionRecipeLink(
        'Abonniert: https://www.youtube.com/@chefkoch\nhttps://www.instagram.com/chefkoch_de/\nhttps://amzn.to/3xyz\nhttps://www.chefkoch.de/',
      ),
    ).toBeUndefined();
    expect(
      descriptionRecipeLink(
        'Shop: https://shop.example.de/\nRezept: https://www.example-kocht.de/recipe/lasagne).',
      ),
    ).toBe('https://www.example-kocht.de/recipe/lasagne');
    expect(descriptionRecipeLink('')).toBeUndefined();
    // "Zutaten und Rezept: <link>" points to the list elsewhere: no ingredient part of its own.
    expect(
      descriptionRecipeLink('Zutaten und Rezept: https://www.chefkoch.de/rezepte/1/lasagne.html'),
    ).toBe('https://www.chefkoch.de/rezepte/1/lasagne.html');
  });
});
