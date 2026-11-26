// The search providers of the web search (spec 0049, REQ-006): Serper.dev (Google results) first,
// the Brave Search API when Serper fails, is out of credits or answers in a shape we do not know.
// One small interface, so a provider can be swapped. Keys travel only in request headers; logs
// carry the provider and a status, never a key, a query or an address.
import { z } from 'zod';

import type { OpeningDay } from './contract.gen.ts';
import type { Deps } from './deps.ts';
import { HttpError } from './errors.ts';
import { fetchTextWithRetry } from './retry.ts';
import { mapsLinkOfCid, pickPlaceHits, priceLevelOf, weekdayOf } from './web-results.gen.ts';

export interface WebHit {
  title: string;
  url: string;
  snippet?: string;
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
}

export interface PlaceHit {
  title: string;
  address?: string;
  location?: { lat: number; lng: number };
  rating?: number;
  ratingCount?: number;
  category?: string;
  websiteUrl?: string;
  mapsUrl?: string;
  imageUrl?: string;
  openingHours?: OpeningDay[];
  priceLevel?: 1 | 2 | 3 | 4;
  snippet?: string;
}

/** The centre of a place search and the map zoom around it. */
export interface Around {
  lat: number;
  lng: number;
  zoom: number;
}

export interface SearchProvider {
  name: 'serper' | 'brave';
  web(query: string): Promise<WebHit[]>;
  places(query: string, around?: Around): Promise<PlaceHit[]>;
}

/** One provider gave no usable answer; the next one is asked. */
class ProviderFailed extends Error {
  constructor(readonly status?: number) {
    super('provider_failed');
    this.name = 'ProviderFailed';
  }
}

const TIMEOUT_MS = 8000;
const MAX_URL = 2048;
const MAX_TEXT = 400;

const text = z.string().trim().min(1).catch('').optional();
const num = z.number().finite().optional().catch(undefined);

const cleanText = (value: string | undefined, max = MAX_TEXT) => {
  const cleaned = value
    ?.replace(/<[^>]{0,100}>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return cleaned ? cleaned : undefined;
};

/** https as given; an http website becomes https (the app only opens https links). */
function httpsUrl(value: string | undefined, upgrade = false): string | undefined {
  if (!value || value.length > MAX_URL) return undefined;
  const url = upgrade ? value.replace(/^http:\/\//i, 'https://') : value;
  try {
    return new URL(url).protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function rating(value: number | undefined): number | undefined {
  return value !== undefined && value >= 0 && value <= 5 ? value : undefined;
}

function count(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** Drops undefined fields so the hits compare and serialise cleanly. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

async function request(
  deps: Pick<Deps, 'fetch'>,
  provider: SearchProvider['name'],
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let reply: { status: number; text: string };
  try {
    reply = await fetchTextWithRetry(deps.fetch, url, init, {
      attempts: 1,
      budgetMs: TIMEOUT_MS,
    });
  } catch {
    console.error('web_search_provider_failed', { provider, status: 'network' });
    throw new ProviderFailed();
  }
  if (reply.status !== 200) {
    console.error('web_search_provider_failed', { provider, status: reply.status });
    throw new ProviderFailed(reply.status);
  }
  try {
    return JSON.parse(reply.text) as unknown;
  } catch {
    console.error('web_search_provider_failed', { provider, status: 'invalid_json' });
    throw new ProviderFailed(reply.status);
  }
}

function shape<T extends z.ZodType>(provider: SearchProvider['name'], schema: T, body: unknown) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error('web_search_provider_failed', { provider, status: 'unexpected_shape' });
    throw new ProviderFailed();
  }
  return parsed.data as z.infer<T>;
}

// ---------- Serper.dev ----------

const SerperOrganic = z.object({
  organic: z
    .array(
      z.object({ title: text, link: text, snippet: text, rating: num, ratingCount: num }).catch({}),
    )
    .default([]),
});

const SerperMaps = z.object({
  places: z
    .array(
      z
        .object({
          title: text,
          address: text,
          latitude: num,
          longitude: num,
          rating: num,
          ratingCount: num,
          type: text,
          website: text,
          thumbnailUrl: text,
          priceLevel: text,
          cid: text,
          openingHours: z.record(z.string(), z.string()).optional().catch(undefined),
        })
        .catch({}),
    )
    .default([]),
});

function openingDays(hours: { [day: string]: string } | undefined): OpeningDay[] | undefined {
  if (!hours) return undefined;
  const days = Object.entries(hours).flatMap(([day, value]): OpeningDay[] => {
    const weekday = weekdayOf(day);
    const cleaned = cleanText(value, 120);
    return weekday && cleaned ? [{ weekday, hours: cleaned }] : [];
  });
  return days.length > 0 ? days.slice(0, 7) : undefined;
}

function coordinatesLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function mapPlaces(body: z.infer<typeof SerperMaps>): PlaceHit[] {
  return body.places.flatMap((place): PlaceHit[] => {
    const title = cleanText(place.title, 200);
    if (!title) return [];
    const location =
      place.latitude !== undefined &&
      place.longitude !== undefined &&
      Math.abs(place.latitude) <= 90 &&
      Math.abs(place.longitude) <= 180
        ? { lat: place.latitude, lng: place.longitude }
        : undefined;
    const mapsUrl =
      (place.cid ? mapsLinkOfCid(place.cid) : undefined) ??
      (location ? coordinatesLink(location.lat, location.lng) : undefined);
    return [
      compact({
        title,
        address: cleanText(place.address, 300),
        location,
        rating: rating(place.rating),
        ratingCount: count(place.ratingCount),
        category: cleanText(place.type, 120),
        websiteUrl: httpsUrl(place.website, true),
        mapsUrl,
        imageUrl: httpsUrl(place.thumbnailUrl),
        openingHours: openingDays(place.openingHours),
        priceLevel: priceLevelOf(place.priceLevel),
      }),
    ];
  });
}

function serperProvider(deps: Pick<Deps, 'fetch'>, key: string): SearchProvider {
  const post = (path: string, body: object) =>
    request(deps, 'serper', `https://google.serper.dev/${path}`, {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  return {
    name: 'serper',
    async web(query) {
      const body = shape(
        'serper',
        SerperOrganic,
        await post('search', { q: query, gl: 'de', hl: 'de' }),
      );
      return body.organic.flatMap((hit): WebHit[] => {
        const url = httpsUrl(hit.link);
        const title = cleanText(hit.title, 200);
        if (!url || !title) return [];
        return [
          compact({
            title,
            url,
            snippet: cleanText(hit.snippet),
            rating: rating(hit.rating),
            ratingCount: count(hit.ratingCount),
          }),
        ];
      });
    },
    // Entscheidung 11: Google searched once without a place and once around the centre, at the
    // same time; a text naming a district, a city or one place is found without the centre.
    async places(query, around) {
      const maps = async (ll?: string) =>
        mapPlaces(
          shape(
            'serper',
            SerperMaps,
            await post('maps', { q: query, gl: 'de', hl: 'de', ...(ll ? { ll } : {}) }),
          ),
        );
      if (!around) return maps();
      const [free, near] = await Promise.all([
        maps(),
        maps(`@${around.lat},${around.lng},${around.zoom}z`),
      ]);
      return pickPlaceHits(free, near, around);
    },
  };
}

// ---------- Brave Search API ----------

const BraveWeb = z.object({
  web: z
    .object({
      results: z
        .array(
          z
            .object({
              title: text,
              url: text,
              description: text,
              thumbnail: z.object({ original: text, src: text }).optional().catch(undefined),
            })
            .catch({}),
        )
        .default([]),
    })
    .default({ results: [] }),
});

function braveProvider(deps: Pick<Deps, 'fetch'>, key: string): SearchProvider {
  const web = async (query: string): Promise<WebHit[]> => {
    const params = new URLSearchParams({ q: query, country: 'DE', search_lang: 'de', count: '10' });
    const body = shape(
      'brave',
      BraveWeb,
      await request(deps, 'brave', `https://api.search.brave.com/res/v1/web/search?${params}`, {
        method: 'GET',
        headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
      }),
    );
    return body.web.results.flatMap((hit): WebHit[] => {
      const url = httpsUrl(hit.url);
      const title = cleanText(hit.title, 200);
      if (!url || !title) return [];
      return [
        compact({
          title,
          url,
          snippet: cleanText(hit.description),
          imageUrl: httpsUrl(hit.thumbnail?.original) ?? httpsUrl(hit.thumbnail?.src),
        }),
      ];
    });
  };
  return {
    name: 'brave',
    web,
    // The plan without local results: places are web results, with website and picture.
    async places(query) {
      return (await web(query)).map((hit) =>
        compact({
          title: hit.title,
          websiteUrl: hit.url,
          imageUrl: hit.imageUrl,
          snippet: hit.snippet,
        }),
      );
    },
  };
}

/** The providers whose key is set, in the order they are asked. */
export function configuredProviders(deps: Pick<Deps, 'fetch' | 'env'>): SearchProvider[] {
  const serper = deps.env('SERPER_API_KEY')?.trim();
  const brave = deps.env('BRAVE_SEARCH_API_KEY')?.trim();
  return [
    ...(serper ? [serperProvider(deps, serper)] : []),
    ...(brave ? [braveProvider(deps, brave)] : []),
  ];
}

/**
 * Asks the providers in order until one answers; `search_unavailable` when none does (AC-023).
 */
export async function searchWithFallback<T>(
  providers: readonly SearchProvider[],
  run: (provider: SearchProvider) => Promise<T>,
): Promise<{ value: T; provider: SearchProvider['name'] }> {
  if (providers.length === 0) {
    console.error('web_search_not_configured');
    throw new HttpError('search_unavailable');
  }
  for (const provider of providers) {
    try {
      return { value: await run(provider), provider: provider.name };
    } catch (error) {
      if (!(error instanceof ProviderFailed)) throw error;
    }
  }
  throw new HttpError('search_unavailable');
}
