// "Websuche" (spec 0049): the requests carry the active household; no provider answering is an
// AiError with the reason "search"; offline nothing is sent; nothing is stored.
import type { WebResult, WebSearchReply } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { AiError } from './ai';
import { H, withBackend } from './backend-test-helpers';
import { getData, OfflineError } from './store';
import { placePreviewAsync, webSearchAsync } from './web-search';

const fx = withBackend();

const card: WebResult = {
  url: 'https://www.chefkoch.de/rezepte/393031127655461/Spaghetti-Bolognese.html',
  title: 'Spaghetti Bolognese – einfach und lecker',
  source: 'chefkoch.de',
  rating: 4.7,
  ratingCount: 638,
};
const reply: WebSearchReply = { provider: 'serper', query: 'Bolognese', results: [card] };

describe('webSearchAsync (REQ-002)', () => {
  it('AC-005, AC-008: sends kind, query and centre for the active household', async () => {
    await fx.startEnrico();
    const sent: unknown[] = [];
    fx.server.setAi({
      webSearch: (request) => {
        sent.push(request);
        return reply;
      },
    });
    const before = getData().recipes.length;
    await expect(webSearchAsync({ kind: 'recipe', query: ' Bolognese ' })).resolves.toEqual(reply);
    await webSearchAsync({
      kind: 'restaurant',
      query: 'vietnamesisch',
      near: { lat: 52.5, lng: 13.4 },
    });
    expect(sent).toEqual([
      { mode: 'search', householdId: H, kind: 'recipe', query: 'Bolognese' },
      {
        mode: 'search',
        householdId: H,
        kind: 'restaurant',
        query: 'vietnamesisch',
        near: { lat: 52.5, lng: 13.4 },
      },
    ]);
    expect(getData().recipes).toHaveLength(before);
  });

  it('AC-023: no provider answering is AiError "search"; offline nothing is sent', async () => {
    const engine = await fx.startEnrico();
    fx.server.setAi({});
    const failed = await webSearchAsync({ kind: 'recipe', query: 'x' }).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(AiError);
    expect((failed as AiError).reason).toBe('search');
    engine.setSimulatedOffline(true);
    let calls = 0;
    fx.server.setAi({
      webSearch: () => {
        calls += 1;
        return reply;
      },
    });
    await expect(webSearchAsync({ kind: 'recipe', query: 'x' })).rejects.toBeInstanceOf(
      OfflineError,
    );
    expect(calls).toBe(0);
  });
});

describe('placePreviewAsync (REQ-003)', () => {
  it('AC-012: sends the card back and returns the proposal', async () => {
    await fx.startEnrico();
    const sent: unknown[] = [];
    const place: WebResult = { ...card, source: 'Google Maps', title: 'Madame Hien' };
    fx.server.setAi({
      placePreview: (request) => {
        sent.push(request);
        return { proposal: { cuisine: 'Vietnamesisch' } };
      },
    });
    await expect(placePreviewAsync('restaurant', place)).resolves.toEqual({
      cuisine: 'Vietnamesisch',
    });
    expect(sent).toEqual([{ mode: 'place', householdId: H, kind: 'restaurant', result: place }]);
  });
});
