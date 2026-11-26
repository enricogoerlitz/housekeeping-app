import { describe, expect, it, vi } from 'vitest';

import type { PublicFetchDeps } from './fetch-public.ts';
import {
  isTikTokHost,
  loadTikTokVideo,
  readTikTok,
  TikTokVideoError,
  tiktokFetchHost,
  VIDEO_MAX_BYTES,
  vttText,
} from './tiktok.ts';

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

// The video of the page (spec 0043): playAddr on TikTok's own video hosts, loaded with the cookies
// the page set and TikTok as the referer (checked 26.11.2026: without either the host answers 403).
const PLAY = 'https://v16-webapp-prime.tiktok.com/video/tos/maliva/abc/?a=1988&bti=x';
const MP4 = Uint8Array.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const VIDEO_ITEM = { ...ITEM, video: { ...ITEM.video, playAddr: PLAY, size: MP4.byteLength } };

const pageWithCookies = (item: unknown) =>
  new Response(page(item), {
    status: 200,
    headers: [
      ['content-type', 'text/html; charset=utf-8'],
      ['set-cookie', 'ttwid=1%7Cabc; Domain=.tiktok.com; Path=/; Secure; HttpOnly'],
      ['set-cookie', 'tt_chain_token=xyz; Path=/'],
    ],
  });
const mp4 = (bytes: Uint8Array<ArrayBuffer> = MP4, headers: { [name: string]: string } = {}) =>
  new Response(bytes, { status: 200, headers: { 'content-type': 'video/mp4', ...headers } });

async function videoError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TikTokVideoError) return error.reason;
    throw error;
  }
  return 'resolved';
}

describe('loadTikTokVideo (spec 0043, REQ-001)', () => {
  it('AC-012 (0046): a cover outside TikTok is no poster; the video still loads', async () => {
    const item = {
      ...VIDEO_ITEM,
      video: { ...VIDEO_ITEM.video, cover: 'https://evil.example.org/c.jpg', originCover: '' },
    };
    const d = deps({ [LONG]: () => pageWithCookies(item), [PLAY]: () => mp4() });
    const result = await loadTikTokVideo(LONG, d);
    expect(result.bytes).toEqual(MP4);
    expect(result.coverUrl).toBeUndefined();
  });

  it("AC-001: resolves the short link and loads playAddr with the page's cookies and TikTok as referer", async () => {
    const d = deps({
      [SHORT]: () => moved(LONG),
      [LONG]: () => pageWithCookies(VIDEO_ITEM),
      [PLAY]: () => mp4(),
    });
    const { bytes, coverUrl } = await loadTikTokVideo(SHORT, d);
    expect(bytes).toEqual(MP4);
    // Spec 0046, AC-012: the same page names the cover for the poster.
    expect(coverUrl).toBe(COVER);
    expect(d.fetchMock.mock.calls.map(([url]) => String(url))).toEqual([SHORT, LONG, PLAY]);
    const [, init] = d.fetchMock.mock.calls[2] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get('cookie')).toBe('ttwid=1%7Cabc; tt_chain_token=xyz');
    expect(headers.get('referer')).toBe('https://www.tiktok.com/');
    expect(headers.get('accept')).toBe('video/mp4');
  });

  it('AC-002: no video when the page has no data, no playAddr, or one outside TikTok', async () => {
    for (const item of [
      undefined,
      { ...ITEM },
      { ...ITEM, video: { ...ITEM.video, playAddr: 'https://evil.example.org/v.mp4' } },
      { ...ITEM, video: { ...ITEM.video, playAddr: 'http://v16-webapp-prime.tiktok.com/v' } },
    ]) {
      const d = deps({ [LONG]: () => html(item ? page(item) : '<html>Captcha</html>') });
      expect(await videoError(loadTikTokVideo(LONG, d))).toBe('unavailable');
      expect(d.fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('AC-002: a refused, a non-video or a broken answer is no video', async () => {
    const answers: (() => Response)[] = [
      () => new Response('<html>Access Denied</html>', { status: 403 }),
      () => html('<html></html>'),
      () => mp4(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9])),
      () => {
        throw new TypeError('connection reset');
      },
    ];
    for (const answer of answers) {
      const d = deps({ [LONG]: () => pageWithCookies(VIDEO_ITEM), [PLAY]: answer });
      expect(await videoError(loadTikTokVideo(LONG, d))).toBe('unavailable');
    }
  });

  it('AC-002: a dead link and a redirect away from TikTok are no video', async () => {
    const dead = deps({ [SHORT]: () => new Response('', { status: 404 }) });
    expect(await videoError(loadTikTokVideo(SHORT, dead))).toBe('unavailable');
    const away = deps({ [SHORT]: () => moved('https://evil.example.org/x') });
    expect(await videoError(loadTikTokVideo(SHORT, away))).toBe('unavailable');
    expect(away.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AC-003: a video over 50 MB is too_large, by the page's size or the answer's header", async () => {
    expect(VIDEO_MAX_BYTES).toBe(50 * 1024 * 1024);
    const big = { ...VIDEO_ITEM, video: { ...VIDEO_ITEM.video, size: VIDEO_MAX_BYTES + 1 } };
    const declared = deps({ [LONG]: () => pageWithCookies(big) });
    expect(await videoError(loadTikTokVideo(LONG, declared))).toBe('too_large');
    expect(declared.fetchMock).toHaveBeenCalledTimes(1);
    const header = deps({
      [LONG]: () => pageWithCookies(VIDEO_ITEM),
      [PLAY]: () => mp4(MP4, { 'content-length': String(VIDEO_MAX_BYTES + 1) }),
    });
    expect(await videoError(loadTikTokVideo(LONG, header))).toBe('too_large');
  });
});
