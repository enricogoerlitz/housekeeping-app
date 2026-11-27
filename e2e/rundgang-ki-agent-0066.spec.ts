import type { AgentStreamEvent } from '@housekeeping/core';
import type { Page, Route } from '@playwright/test';

import {
  back,
  deleteAiChatRow,
  expect,
  freshSeed,
  goOffline,
  insertAiChat,
  open,
  openManaged,
  test,
  tid,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0066 "KI-Agent": the entry in "Restaurants" and "Aktivitäten", the page with its input and
// place, an answer with steps, text, cards, sources and follow-ups, "Speichern", "Verlauf" with
// opening and deleting, and offline. ai-agent is answered here (page.route), so no paid call runs;
// the edge function itself is covered by supabase/functions/ai-agent/handler.test.ts.

freshSeed();

const CHAT = 'cccccccc-0000-4000-8000-00000000e2e1';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const answer: AgentStreamEvent[] = [
  { type: 'chat', chatId: CHAT, title: 'Romantisch in Mitte' },
  {
    type: 'step',
    step: {
      id: 'web',
      kind: 'web_search',
      label: 'Sucht im Web',
      details: ['romantisch mitte vegetarisch'],
      count: 6,
      countLabel: 'Quellen',
      status: 'done',
    },
  },
  { type: 'text', delta: 'Drei Häuser in Mitte. Am romantischsten ist das **Crackers**.' },
  { type: 'cards_pending' },
  {
    type: 'cards',
    title: 'Romantisch in Mitte',
    followUps: ['Eher mit Terrasse'],
    cards: [
      {
        index: 0,
        kind: 'restaurant',
        name: 'Crackers Mitte E2E',
        category: 'Gourmet',
        address: 'Friedrichstraße 158, 10117 Berlin',
        priceLevel: 3,
        openStatus: 'Heute ab 18:00 geöffnet',
        why: 'Versteckt hinter einer unscheinbaren Tür.',
        tags: [],
        rating: 4.5,
        ratingCount: 1457,
        mapsUrl: 'https://maps.google.com/?cid=123',
        location: { lat: 52.5235, lng: 13.3888 },
      },
      {
        index: 1,
        kind: 'activity',
        name: 'Computerspielemuseum E2E',
        category: 'Museum',
        why: 'Spiele zum Anfassen, auch bei Regen.',
        tags: [],
      },
    ],
  },
  { type: 'sources', sources: [{ url: 'https://www.tip-berlin.de/x', host: 'tip-berlin.de' }] },
  { type: 'done' },
];

const sse = (events: AgentStreamEvent[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

/** Answers ai-agent: `send` with `events`, `load` with `messages`, `delete` as the server would. */
async function stubAgent(
  page: Page,
  options: { events?: AgentStreamEvent[]; sent?: unknown[]; onDelete?: (chatId: string) => void },
): Promise<void> {
  await page.route('**/functions/v1/ai-agent', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      action: string;
      chatId?: string;
    };
    options.sent?.push(body);
    if (body.action === 'send') {
      await route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'text/event-stream' },
        body: sse(options.events ?? answer),
      });
    } else if (body.action === 'load') {
      await route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        json: {
          messages: [
            {
              role: 'user',
              text: 'Brunch mit Kinderwagen',
              cards: [],
              followUps: [],
              sources: [],
              steps: [],
            },
            {
              role: 'assistant',
              text: 'Zwei Cafés mit Platz für den Kinderwagen.',
              cards: [],
              followUps: [],
              sources: [],
              steps: [],
            },
          ],
        },
      });
    } else {
      if (body.chatId) options.onDelete?.(body.chatId);
      await route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        json: { deleted: 1 },
      });
    }
  });
}

async function openAgentFromRestaurants(page: Page): Promise<void> {
  await open(page, '/rezepte?ansicht=restaurants');
  await tid(page, 'agent-open').click();
  await expect(tid(page, 'agent-screen')).toBeVisible();
}

test('AC-001, AC-003, AC-004, AC-005: ✨ in "Restaurants" opens the empty page, back to the list', async ({
  page,
}) => {
  await open(page, '/rezepte');
  await expect(tid(page, 'agent-open')).toHaveCount(0);
  await openAgentFromRestaurants(page);
  await expect(tid(page, 'agent-title')).toContainText('KI-Agent');
  await expect(tid(page, 'agent-title')).toContainText('Restaurants und Aktivitäten, mit Websuche');
  await expect(tid(page, 'agent-place-chip')).toContainText('Hier · Zu Fuß');
  await expect(tid(page, 'agent-messages')).toHaveText('');
  await expect(tid(page, 'agent-send')).toHaveAttribute('aria-disabled', 'true');
  await tid(page, 'agent-input').fill('   ');
  await expect(tid(page, 'agent-send')).toHaveAttribute('aria-disabled', 'true');
  await back(page);
  await expect(page).toHaveURL(/ansicht=restaurants/);
});

test('AC-002: ✨ in "Aktivitäten" and back there', async ({ page }) => {
  await openManaged(page, 'activities');
  await tid(page, 'agent-open').click();
  await expect(tid(page, 'agent-screen')).toBeVisible();
  await back(page);
  await expect(page).toHaveURL(/\/aktivitaeten/);
});

test('AC-014, AC-016, AC-017, AC-020, AC-021: an answer with steps, cards, sources; save and follow-up', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 52.510612, longitude: 13.459487 });
  const sent: unknown[] = [];
  await stubAgent(page, { sent });
  await openAgentFromRestaurants(page);
  await tid(page, 'agent-input').fill('Romantisch in Mitte');
  await tid(page, 'agent-send').click();

  await expect(tid(page, 'agent-turn-0')).toHaveText('Romantisch in Mitte');
  await expect(tid(page, 'agent-turn-1-steps')).toContainText('Sucht im Web · 6 Quellen');
  await tid(page, 'agent-turn-1-steps-web-toggle').click();
  await expect(tid(page, 'agent-turn-1-steps-web-details')).toContainText(
    'romantisch mitte vegetarisch',
  );
  await expect(tid(page, 'agent-turn-1-text')).toHaveText(
    'Drei Häuser in Mitte. Am romantischsten ist das Crackers.',
  );
  await expect(tid(page, 'agent-turn-1-card-0-meta')).toHaveText('4,5 · €€€ · Gourmet');
  await expect(tid(page, 'agent-turn-1-card-0-maps')).toBeVisible();
  // AC-018: no Google data for the second card: no maps button, no stars.
  await expect(tid(page, 'agent-turn-1-card-1-maps')).toHaveCount(0);
  await expect(tid(page, 'agent-turn-1-sources')).toContainText('tip-berlin.de');
  // The address follows the new chat; the head names it.
  await expect(page).toHaveURL(new RegExp(`chat=${CHAT}`));
  await expect(tid(page, 'agent-title')).toContainText('Romantisch in Mitte');

  // AC-007: the device location goes with the message; the request has no instructions.
  expect(sent[0]).toMatchObject({
    action: 'send',
    householdId: seedIds['hh-demo'],
    message: 'Romantisch in Mitte',
    place: { source: 'device', location: { lat: 52.510612, lng: 13.459487 }, radius: 'walk' },
  });

  // AC-021, AC-023: saved as a restaurant and as an activity through the normal write path.
  await tid(page, 'agent-turn-1-card-0-save').click();
  await expect(tid(page, 'agent-turn-1-card-0-saved')).toBeVisible();
  await tid(page, 'agent-turn-1-card-1-save').click();
  await expect(tid(page, 'agent-turn-1-card-1-saved')).toBeVisible();

  // AC-020: the follow-up goes into the same chat.
  await tid(page, 'agent-turn-1-follow-ups').getByText('Eher mit Terrasse').click();
  await expect(tid(page, 'agent-turn-2')).toHaveText('Eher mit Terrasse');
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toMatchObject({ action: 'send', chatId: CHAT, message: 'Eher mit Terrasse' });

  // AC-022: the saved restaurant is in the list.
  await open(page, '/rezepte?ansicht=restaurants');
  await expect(page.getByText('Crackers Mitte E2E').first()).toBeVisible();
});

test('AC-008, AC-009, AC-012: without location the place window opens; a maps link pins the place', async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  const sent: unknown[] = [];
  await stubAgent(page, { sent });
  await openAgentFromRestaurants(page);
  await tid(page, 'agent-input').fill('Pizza');
  await tid(page, 'agent-send').click();
  await expect(tid(page, 'agent-place-hint')).toHaveText(
    'Standort nicht verfügbar – wähle einen Ort.',
  );
  expect(sent).toEqual([]);
  await tid(page, 'agent-place-radius-transit').click();
  await tid(page, 'agent-place-text').fill(
    'https://www.google.com/maps/place/Katz+Orange/@52.5313,13.3977,17z',
  );
  await tid(page, 'agent-place-take').click();
  await expect(tid(page, 'agent-place-chip')).toHaveText('Katz Orange · Öffis');
  await expect(tid(page, 'agent-input')).toHaveValue('Pizza');
  await tid(page, 'agent-send').click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({
    place: {
      source: 'pinned',
      label: 'Katz Orange',
      radius: 'transit',
      location: { lat: 52.5313, lng: 13.3977 },
    },
  });
  // AC-013: the place is under "Zuletzt" next time.
  await tid(page, 'agent-place-chip').click();
  await expect(tid(page, 'agent-place-recent-0')).toContainText('Katz Orange');
});

test('AC-024, AC-025, AC-027, AC-028: "Verlauf" lists, opens and deletes the household’s chats', async ({
  page,
}) => {
  const deleted: string[] = [];
  await stubAgent(page, {
    onDelete: (chatId) => {
      deleteAiChatRow(chatId);
      deleted.push(chatId);
    },
  });
  await openAgentFromRestaurants(page);
  await tid(page, 'agent-history-open').click();
  await expect(tid(page, 'agent-history-empty')).toContainText('Noch keine Recherchen');
  await page.keyboard.press('Escape');

  const chatId = insertAiChat({
    householdId: seedIds['hh-demo'],
    title: 'Brunch mit Kinderwagen',
    placeLabel: 'Friedrichshain',
    createdBy: seedIds['m-nadja'],
  });
  await page.reload();
  await expect(tid(page, 'agent-screen')).toBeVisible();
  await tid(page, 'agent-history-open').click();
  await expect(tid(page, `agent-history-${chatId}`)).toContainText('Brunch mit Kinderwagen');
  await expect(tid(page, `agent-history-${chatId}`)).toContainText('Friedrichshain');
  await expect(tid(page, `agent-history-${chatId}`)).toContainText('Nadja');
  await tid(page, `agent-history-${chatId}-open`).click();
  await expect(tid(page, 'agent-turn-0')).toHaveText('Brunch mit Kinderwagen');
  await expect(tid(page, 'agent-turn-1-text')).toHaveText(
    'Zwei Cafés mit Platz für den Kinderwagen.',
  );

  await tid(page, 'agent-history-open').click();
  await tid(page, `agent-history-${chatId}-delete`).click();
  await tid(page, 'agent-history-confirm-confirm').click();
  await expect.poll(() => deleted).toEqual([chatId]);
  await expect(tid(page, `agent-history-${chatId}`)).toHaveCount(0);
});

test('AC-039: offline the input is off with a hint and "Verlauf" still opens', async ({ page }) => {
  await openAgentFromRestaurants(page);
  await goOffline(page);
  await expect(tid(page, 'agent-offline-hint')).toHaveText(
    'Offline – zum Recherchieren brauchst du Netz',
  );
  await expect(tid(page, 'agent-send')).toHaveAttribute('aria-disabled', 'true');
  await tid(page, 'agent-history-open').click();
  await expect(tid(page, 'agent-history')).toBeVisible();
});
