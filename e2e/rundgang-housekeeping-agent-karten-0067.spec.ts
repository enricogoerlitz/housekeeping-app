import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AgentExtra,
  AgentLoadReply,
  AgentStreamEvent,
  RecipeDraftReply,
} from '@housekeeping/core';
import type { Page, Route } from '@playwright/test';

import { day, expect, freshSeed, fulfilError, open, openManaged, test, tid } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0067 "Housekeeping-Agent", steps B and C: what the agent proposes and the app carries out
// — the collect card with its result and "Rückgängig" (REQ-009), the recipe draft into the editor
// (REQ-010), the household's own entries as cards (decision 29), "Woche füllen" (REQ-014), a
// variant (decision 38), "Als Foto nehmen" (REQ-011), steps folded to one line (decision 53) and
// one answer per chat (AC-024). Every create or change through the chat ends with a card of the
// entry it touched (preview 28.11.). ai-agent, ai-recipe-draft and ai-image are answered here
// (page.route), so no paid call runs.

freshSeed();

const CHAT = 'cccccccc-0000-4000-8000-00000000e268';
const LASAGNE = seedIds['rec-lasagne'];
const LINSEN = seedIds['rec-linsen-dal'];
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const here = path.dirname(fileURLToPath(import.meta.url));
const PHOTO = readFileSync(path.join(here, 'fixtures/eislaufen-gps.jpg')).toString('base64');

const sse = (events: AgentStreamEvent[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

const extra = (value: AgentExtra): AgentStreamEvent => ({ type: 'extra', extra: value });

/** One answer of the agent: a new chat, its text, the extras, done. */
const answerWith = (text: string, ...extras: AgentExtra[]): AgentStreamEvent[] => [
  { type: 'chat', chatId: CHAT, title: 'Haushalt' },
  { type: 'text', delta: text },
  ...extras.map(extra),
  { type: 'done' },
];

interface Stub {
  /** Every request body, in order. */
  sent: Record<string, unknown>[];
}

/**
 * Answers ai-agent: each `send` with the next of `answers` ("busy" = 409 chat_busy), `status`
 * with "no answer runs", `load` with `load`.
 */
async function stubAgent(
  page: Page,
  answers: (AgentStreamEvent[] | 'busy')[],
  load: AgentLoadReply = { messages: [] },
): Promise<Stub> {
  const stub: Stub = { sent: [] };
  await page.route('**/functions/v1/ai-agent', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    stub.sent.push(body);
    if (body.action === 'status') {
      await route.fulfill({ headers: CORS, json: { answering: false } });
      return;
    }
    if (body.action === 'load') {
      await route.fulfill({ headers: CORS, json: load });
      return;
    }
    const next = answers.shift() ?? answerWith('Gern.');
    if (next === 'busy') {
      await fulfilError(route, 'chat_busy');
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'text/event-stream' },
      body: sse(next),
    });
  });
  return stub;
}

async function openAgent(page: Page): Promise<void> {
  await open(page, '/');
  await openManaged(page, 'agent');
  await expect(tid(page, 'agent-screen')).toBeVisible();
}

async function ask(page: Page, message: string): Promise<void> {
  await tid(page, 'agent-input').fill(message);
  await tid(page, 'agent-send').click();
}

const toolStep = (id: string, label: string, count: number): AgentStreamEvent => ({
  type: 'step',
  step: { id, kind: 'tool', label, details: [], count, countLabel: 'Treffer', status: 'done' },
});

test('AC-017, AC-018, decision 53, preview 28.11.: steps fold to one line; the collect card applies the ticked entries, shows what it touched and takes it back', async ({
  page,
}) => {
  const proposal: AgentExtra = {
    kind: 'proposal',
    proposal: {
      id: 'call_p',
      title: 'Für diese Woche',
      actions: [
        { kind: 'add_to_list', name: 'Milch E2E' },
        { kind: 'add_to_list', name: 'Eier E2E' },
        { kind: 'plan', target: 'recipe', id: LINSEN, name: 'Linsen-Dal', date: day(3) },
      ],
    },
  };
  const events = answerWith('Hier ist mein Vorschlag.', proposal);
  events.splice(
    1,
    0,
    toolStep('t1', 'Liest eure Liste', 4),
    toolStep('t2', 'Liest eure Rezepte', 2),
    toolStep('t3', 'Schaut in den Kalender', 5),
  );
  await stubAgent(page, [events]);
  await openAgent(page);
  await ask(page, 'Milch und Eier auf die Liste, Linsen-Dal am Dienstag');

  // The answer is complete once its card stands (the chat stops following the end).
  const card = 'agent-turn-1-extra-0';
  await expect(tid(page, `${card}-apply`)).toBeVisible();

  // Decision 53: three steps are one line "3 Schritte"; a tap shows them all.
  const group = tid(page, 'agent-turn-1-steps-group');
  await expect(group).toHaveText('3 Schritte');
  await expect(tid(page, 'agent-turn-1-steps-t2')).toHaveCount(0);
  await group.click();
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(tid(page, 'agent-turn-1-steps-t2')).toContainText('Liest eure Rezepte');

  // AC-017: three entries, all ticked; AC-018: one unticked, two taken over.
  await expect(tid(page, `${card}-apply`)).toHaveText('3 übernehmen');
  await tid(page, `${card}-entry-1`).click();
  await expect(tid(page, `${card}-apply`)).toHaveText('2 übernehmen');
  await tid(page, `${card}-apply`).click();
  await expect(tid(page, `${card}-entry-0-status`)).toHaveText('Auf die Liste · Übernommen');
  await expect(tid(page, `${card}-entry-2-status`)).toContainText('Übernommen');
  // What it touched stands under the card: the planned recipe.
  await expect(tid(page, `${card}-made-0`)).toContainText('Linsen-Dal');

  // "Rückgängig" takes both back and the result card goes.
  await tid(page, `${card}-undo`).click();
  await expect(tid(page, `${card}-entry-0-status`)).toHaveText('Auf die Liste · Zurückgenommen');
  await expect(tid(page, `${card}-made`)).toHaveCount(0);
  await open(page, '/liste');
  await expect(page.getByText('Eier E2E')).toHaveCount(0);
  await expect(page.getByText('Milch E2E')).toHaveCount(0);
});

test('REQ-010, decision 29: the draft opens in the editor; once created the card offers "Öffnen" and shows the recipe', async ({
  page,
}) => {
  const reply: RecipeDraftReply = {
    draft: {
      title: 'Ofengemüse E2E',
      description: 'Bunt aus dem Ofen.',
      servings: 2,
      totalMinutes: 40,
      course: 'main',
      tags: [],
      variants: [],
      ingredients: [
        { name: 'Karotte', amount: '3' },
        { name: 'Pastinake E2E', amount: '2' },
      ],
      steps: [{ text: 'Alles schneiden und 35 Minuten backen.' }],
    },
    sources: [],
  };
  await stubAgent(page, [
    answerWith(
      'Der Entwurf für 2.',
      { kind: 'recipe_draft', id: 'call_d', reply },
      { kind: 'entities', id: 'call_e', items: [{ kind: 'recipe', id: LASAGNE }] },
    ),
  ]);
  await openAgent(page);
  await ask(page, 'Leg Ofengemüse für 2 an');

  const card = 'agent-turn-1-extra-0';
  await expect(tid(page, `${card}-title`)).toHaveText('Ofengemüse E2E');
  await expect(tid(page, `${card}-meta`)).toContainText('2 Portionen · 40 Min.');
  // AC-021: only the ingredient outside the catalogue is "neu".
  await expect(tid(page, `${card}-new-1`)).toBeVisible();
  await expect(tid(page, `${card}-new-0`)).toHaveCount(0);

  // Decision 29: an own entry as a card opens over the chat; closing comes back to it.
  await tid(page, 'agent-turn-1-extra-1-0').click();
  await expect(tid(page, 'recipe-title')).toHaveText('Lasagne');
  await page.getByRole('button', { name: 'Rezept schließen' }).click();
  await expect(tid(page, `${card}-check`)).toBeVisible();

  // "Prüfen und anlegen": the known editor with the draft, then "Anlegen".
  await tid(page, `${card}-check`).click();
  await expect(tid(page, 'recipe-head-title')).toHaveValue('Ofengemüse E2E');
  await tid(page, 'recipe-edit-save').click();
  await expect(tid(page, 'recipe-title')).toHaveText('Ofengemüse E2E');
  await page.goBack();
  await expect(tid(page, `${card}-open`)).toBeVisible();
  await expect(tid(page, `${card}-saved-0`)).toContainText('Ofengemüse E2E');
});

test('REQ-014, preview 28.11.: "Woche füllen" plans the ticked evenings and shows the dishes as cards', async ({
  page,
}) => {
  await stubAgent(page, [
    answerWith('Hier ist eure Woche.', {
      kind: 'week_fill',
      id: 'call_w',
      wishes: { from: day(8), to: day(12), quick: [], guests: [], skip: [] },
    }),
  ]);
  await openAgent(page);
  await ask(page, 'Füll die Woche in zwei Wochen');

  const card = 'agent-turn-1-extra-0';
  await expect(tid(page, `${card}-apply`)).toBeVisible();
  await expect(tid(page, `${card}-made`)).toHaveCount(0);
  await tid(page, `${card}-apply`).click();
  await expect(tid(page, `${card}-undo`)).toBeVisible();
  await expect(
    page.locator(`[data-testid^="${card}-row-"][data-testid$="-status"]`).first(),
  ).toContainText('Eingeplant');
  // The result: the planned dishes as recipe cards.
  await expect(tid(page, `${card}-made-0`)).toBeVisible();
  await tid(page, `${card}-undo`).click();
  await expect(tid(page, `${card}-made`)).toHaveCount(0);
});

test('decision 38, preview 28.11.: a variant taken over on the recipe shows the recipe under the change card', async ({
  page,
}) => {
  await stubAgent(page, [
    answerWith('Schau dir die Änderung an.', {
      kind: 'recipe_change',
      id: 'call_c',
      recipeId: LASAGNE,
      title: 'Lasagne',
      wish: 'vegetarische Variante',
    }),
  ]);
  const changed: RecipeDraftReply = {
    draft: {
      title: 'Lasagne',
      description: 'Klassisch oder vegetarisch.',
      servings: 4,
      course: 'main',
      tags: [],
      variants: [{ name: 'Klassisch' }, { name: 'Vegetarisch' }],
      ingredients: [
        { name: 'Lasagneplatten', amount: '250 g' },
        { name: 'Hackfleisch', amount: '400 g', variant: 'Klassisch' },
        { name: 'Zucchini', amount: '2', variant: 'Vegetarisch' },
      ],
      steps: [{ text: 'Schichten und 40 Minuten backen.' }],
    },
    sources: [],
  };
  const asked: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/ai-recipe-draft', async (route) => {
    asked.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: changed });
  });
  await openAgent(page);
  await ask(page, 'Mach eine vegetarische Variante unserer Lasagne');

  const card = 'agent-turn-1-extra-0';
  await expect(tid(page, `${card}-wish`)).toHaveText('Mit KI ändern: „vegetarische Variante“');
  await tid(page, `${card}-open`).click();
  // The recipe opens over the chat and asks "Mit KI ändern" with the wish: the Änderungsansicht.
  await expect(tid(page, 'recipe-proposal')).toBeVisible();
  expect(asked[0]).toMatchObject({ text: 'vegetarische Variante' });
  await tid(page, 'recipe-proposal-apply').click();
  await expect(tid(page, 'recipe-proposal')).toBeHidden();
  await page.getByRole('button', { name: 'Rezept schließen' }).click();
  await expect(tid(page, `${card}-made-0`)).toContainText('Lasagne');
  // Taken over: no second "Änderung ansehen" (it would ask the AI again).
  await expect(tid(page, `${card}-applied`)).toHaveText('Übernommen');
  await expect(tid(page, `${card}-open`)).toHaveCount(0);
});

test('REQ-011, preview 28.11.: "Als Foto nehmen" saves the AI photo and shows the recipe with it', async ({
  page,
}) => {
  const images: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/ai-image*', async (route) => {
    images.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: { images: [PHOTO], failed: 0 } });
  });
  await stubAgent(page, [
    answerWith('Hier ist ein Foto.', {
      kind: 'image',
      id: 'call_i',
      prompt: 'Lasagne in a baking dish',
      for: 'recipe',
      name: 'Linsen-Dal',
    }),
  ]);
  await openAgent(page);
  await ask(page, 'Mach ein Foto vom Linsen-Dal');

  const card = 'agent-turn-1-extra-0';
  await expect(tid(page, `${card}-take`)).toBeEnabled();
  expect(images).toHaveLength(1);
  expect(images[0]).toMatchObject({ count: 1 });
  await expect(tid(page, `${card}-made`)).toHaveCount(0);
  await tid(page, `${card}-take`).click();
  await expect(tid(page, `${card}-take`)).toHaveText('Übernommen');
  await expect(tid(page, `${card}-made-0`)).toContainText('Linsen-Dal');
});

test('AC-024: a second message while another answer runs in the chat waits and goes afterwards', async ({
  page,
  allowConsoleError,
}) => {
  allowConsoleError(/^Failed to load resource: the server responded with a status of 409/);
  const stub = await stubAgent(
    page,
    [
      answerWith('Diese Woche ist noch viel frei.'),
      'busy',
      answerWith('Am Samstag ist noch Platz.'),
    ],
    {
      messages: [
        {
          role: 'user',
          text: 'Was steht diese Woche an?',
          cards: [],
          followUps: [],
          sources: [],
          steps: [],
          extras: [],
        },
        {
          role: 'assistant',
          text: 'Diese Woche ist noch viel frei.',
          cards: [],
          followUps: [],
          sources: [],
          steps: [],
          extras: [],
        },
        {
          role: 'user',
          text: 'Und was kochen wir am Freitag?',
          cards: [],
          followUps: [],
          sources: [],
          steps: [],
          extras: [],
        },
        {
          role: 'assistant',
          text: 'Am Freitag gibt es Lasagne.',
          cards: [],
          followUps: [],
          sources: [],
          steps: [],
          extras: [],
        },
      ],
    },
  );
  await openAgent(page);
  await ask(page, 'Was steht diese Woche an?');
  await expect(tid(page, 'agent-turn-1-text')).toHaveText('Diese Woche ist noch viel frei.');

  // Nadja's answer runs in this chat: "Agent antwortet gerade …", then her question and answer
  // appear and this message goes.
  await ask(page, 'Haben wir Samstag schon was?');
  await expect(tid(page, 'agent-turn-3-busy')).toHaveText(
    'Agent antwortet gerade … deine Nachricht geht danach.',
  );
  await expect(tid(page, 'agent-turn-3-text')).toHaveText('Am Freitag gibt es Lasagne.', {
    timeout: 15_000,
  });
  await expect(tid(page, 'agent-turn-4')).toHaveText('Haben wir Samstag schon was?');
  await expect(tid(page, 'agent-turn-5-text')).toHaveText('Am Samstag ist noch Platz.');
  expect(stub.sent.map((body) => body.action)).toEqual(['send', 'send', 'status', 'load', 'send']);
  expect(stub.sent[4]).toMatchObject({ chatId: CHAT, message: 'Haben wir Samstag schon was?' });
});
