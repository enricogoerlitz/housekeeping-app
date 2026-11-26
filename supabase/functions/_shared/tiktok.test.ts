import { describe, expect, it, vi } from 'vitest';

import type { PublicFetchDeps } from './fetch-public.ts';
import { isTikTokHost, readTikTok, tiktokFetchHost, vttText } from './tiktok.ts';

// A hand-made page with the JSON paths of a real TikTok video page (checked 26.11.2026 with
// https://vm.tiktok.com/ZGdXoJ8Ay/): desc, cover, author, id and the subtitle list.
const SHORT = 'https://vm.tiktok.com/ZGdXoJ8Ay/';
const LONG =
  'https://www.tiktok.com/@jacobs_lunch/video/7686512961438960929?_r=1&_t=ZG-9BhY0m0GI1X';
const CANONICAL = 'https://www.tiktok.com/@jacobs_lunch/video/7686512961438960929';
const COVER = 'https://p16-common-sign.tiktokcdn-eu.com/tos-useast2a/cover~tplv.jpeg?x=1';
const SUB_DE = 'https://v16-webapp.tiktokcdn-eu.com/sub/de/?a=1988';
const SUB_EN = 'https://v16-webapp.tiktokcdn-eu.com/sub/en/?a=1988';

function page(item: unknown): string {
  const data = {
    __DEFAULT_SCOPE__: {
      'webapp.app-context': { language: 'en' },
      'webapp.video-detail': { itemInfo: { itemStruct: item }, statusCode: 0 },
    },
  };
  return `<html><head><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script></head><body></body></html>`;
}

const ITEM = {
  id: '7686512961438960929',
  desc: 'Fettuccine mit Zucchini und Datteltomaten #pasta',
  author: { uniqueId: 'jacobs_lunch' },
  video: {
    cover: COVER,
    originCover: 'https://p16-common-sign.tiktokcdn-eu.com/origin.jpeg',
    subtitleInfos: [
      { LanguageCodeName: 'eng-US', Format: 'webvtt', Source: 'MT', Url: SUB_EN },
      { LanguageCodeName: 'deu-DE', Format: 'webvtt', Source: 'ASR', Url: SUB_DE },
    ],
  },
};

const VTT = `WEBVTT


00:00:00.160 --> 00:00:00.800
moin ihr Lieben

00:00:00.801 --> 00:00:01.601
2 Zucchini hobeln
`;

const html = (body: string) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
const vtt = (body: string) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
const moved = (location: string) => new Response(null, { status: 301, headers: { location } });

function deps(routes: { [url: string]: () => Response }): PublicFetchDeps & {
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
} {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const route = routes[String(input)];
    if (!route) throw new TypeError(`unexpected fetch ${String(input)}`);
    return route();
  });
  return { fetch: fetchMock, fetchMock, resolveDns: async () => ['93.184.215.14'] };
}

describe('TikTok hosts', () => {
  it('tiktok.com and its subdomains are TikTok links', () => {
    expect(isTikTokHost('vm.tiktok.com')).toBe(true);
    expect(isTikTokHost('www.tiktok.com')).toBe(true);
    expect(isTikTokHost('tiktok.com')).toBe(true);
    expect(isTikTokHost('nottiktok.com')).toBe(false);
    expect(isTikTokHost('tiktok.com.evil.example')).toBe(false);
  });

  it('the fetches stay on TikTok and its CDNs', () => {
    for (const host of ['vm.tiktok.com', 'p16-common-sign.tiktokcdn-eu.com', 'a.tiktokcdn.com'])
      expect(tiktokFetchHost(host)).toBe(true);
    for (const host of ['tiktokcdn-eu.com.evil.example', 'example.org', 'eviltiktok.com'])
      expect(tiktokFetchHost(host)).toBe(false);
  });
});

describe('vttText', () => {
  it('keeps the spoken words only', () => {
    expect(vttText(VTT)).toBe('moin ihr Lieben 2 Zucchini hobeln');
    expect(vttText('WEBVTT\n\n1\n00:00.000 --> 00:01.000\n<c>Hallo</c>\n\nNOTE x\n')).toBe('Hallo');
  });
});

describe('readTikTok (REQ-006)', () => {
  it('AC-016: resolves the short link, reads desc, German subtitles and the cover', async () => {
    const d = deps({
      [SHORT]: () => moved(LONG),
      [LONG]: () => html(page(ITEM)),
      [SUB_DE]: () => vtt(VTT),
    });
    const result = await readTikTok(SHORT, d);
    expect(result).toEqual({
      resolvedUrl: CANONICAL,
      coverUrl: COVER,
      text:
        'Beschreibung: Fettuccine mit Zucchini und Datteltomaten #pasta\n' +
        'Untertitel: moin ihr Lieben 2 Zucchini hobeln',
    });
    expect(d.fetchMock.mock.calls.map(([url]) => String(url))).toEqual([SHORT, LONG, SUB_DE]);
  });

  it('AC-016: an empty desc still gives the subtitles; English when there is no German', async () => {
    const item = {
      ...ITEM,
      desc: '',
      video: { ...ITEM.video, subtitleInfos: [ITEM.video.subtitleInfos[0]] },
    };
    const d = deps({ [LONG]: () => html(page(item)), [SUB_EN]: () => vtt(VTT) });
    const result = await readTikTok(LONG, d);
    expect(result.text).toBe('Untertitel: moin ihr Lieben 2 Zucchini hobeln');
  });

  it('subtitles that fail are left out; the cover falls back to originCover', async () => {
    const item = { ...ITEM, video: { ...ITEM.video, cover: '' } };
    const d = deps({
      [LONG]: () => html(page(item)),
      [SUB_DE]: () => new Response('', { status: 403 }),
    });
    const result = await readTikTok(LONG, d);
    expect(result.text).toBe('Beschreibung: Fettuccine mit Zucchini und Datteltomaten #pasta');
    expect(result.coverUrl).toBe('https://p16-common-sign.tiktokcdn-eu.com/origin.jpeg');
  });

  it('AC-017: a page without the data gives no text, but keeps where the link led', async () => {
    const d = deps({ [SHORT]: () => moved(LONG), [LONG]: () => html('<html>Captcha</html>') });
    expect(await readTikTok(SHORT, d)).toEqual({
      resolvedUrl: 'https://www.tiktok.com/@jacobs_lunch/video/7686512961438960929',
      text: '',
    });
  });

  it('AC-017: a failing page after the redirect still keeps the resolved link', async () => {
    const d = deps({ [SHORT]: () => moved(LONG), [LONG]: () => new Response('', { status: 500 }) });
    expect(await readTikTok(SHORT, d)).toEqual({ resolvedUrl: CANONICAL, text: '' });
  });

  it('AC-017: a dead short link gives nothing at all', async () => {
    const d = deps({ [SHORT]: () => new Response('', { status: 404 }) });
    expect(await readTikTok(SHORT, d)).toEqual({ text: '' });
  });

  it('a redirect away from TikTok is not followed', async () => {
    const d = deps({ [SHORT]: () => moved('https://evil.example.org/x') });
    expect(await readTikTok(SHORT, d)).toEqual({ text: '' });
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a subtitle or cover address outside TikTok is ignored', async () => {
    const item = {
      ...ITEM,
      video: {
        cover: 'https://evil.example.org/c.jpg',
        originCover: 'http://p16.tiktokcdn-eu.com/c.jpg',
        subtitleInfos: [
          { LanguageCodeName: 'deu-DE', Format: 'webvtt', Url: 'https://evil.example.org/s' },
        ],
      },
    };
    const d = deps({ [LONG]: () => html(page(item)) });
    const result = await readTikTok(LONG, d);
    expect(result.coverUrl).toBeUndefined();
    expect(result.text).toBe('Beschreibung: Fettuccine mit Zucchini und Datteltomaten #pasta');
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
  });
});
