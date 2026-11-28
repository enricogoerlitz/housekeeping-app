import type { AgentStreamEvent } from '@housekeeping/core';
import type { Page, Route } from '@playwright/test';

import {
  expect,
  freshSeed,
  goOffline,
  open,
  openManaged,
  openSettings,
  test,
  tid,
} from './helpers';

// Spec 0067 "Housekeeping-Agent", step A: the view "Normal" / "KI zuerst", the way in from ⊞, the
// start page, the slash menu and badges, the input of 4.5 lines, "+" for photos and PDF, and the
// step rows of the household tools. ai-agent is answered here (page.route), so no paid call runs;
// the tools themselves are covered by core agent-tools.test.ts and the function's handler.test.ts.

freshSeed();

const CHAT = 'cccccccc-0000-4000-8000-00000000e267';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const step = (id: string, label: string, detail: string, count: number, countLabel: string) => ({
  type: 'step' as const,
  step: {
    id,
    kind: 'tool' as const,
    label,
    detail,
    details: ['Filter: Ernährung vegan oder vegetarisch', 'Felder: Titel, zuletzt gekocht'],
    count,
    countLabel,
    status: 'done' as const,
  },
});

const answer: AgentStreamEvent[] = [
  { type: 'chat', chatId: CHAT, title: 'Vegetarisch, lange nicht' },
  step('t1', 'Liest eure Rezepte', 'vegan oder vegetarisch', 12, 'von 143'),
  step('t2', 'Schaut in den Kalender', '30. Nov. – 6. Dez.', 4, 'Einträge'),
  { type: 'text', delta: 'Drei, die ihr länger nicht hattet: **Mango-Curry**.' },
  { type: 'done' },
];

const sse = (events: AgentStreamEvent[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

async function stubAgent(page: Page, sent: Record<string, unknown>[]): Promise<void> {
  await page.route('**/functions/v1/ai-agent', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    sent.push(body);
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'text/event-stream' },
      body: sse(answer),
    });
  });
}

async function openAgent(page: Page): Promise<void> {
  await chooseView(page, 'normal');
  await open(page, '/');
  await openManaged(page, 'agent');
  await expect(tid(page, 'agent-screen')).toBeVisible();
}

async function chooseView(page: Page, view: 'normal' | 'ai_first'): Promise<void> {
  await open(page, '/');
  await openSettings(page);
  await tid(page, `app-view-${view}`).click();
  await expect(tid(page, `app-view-${view}`)).toHaveAttribute('aria-checked', 'true');
}

test('AC-004: in "Normal" ⊞ Verwalten → "Agent" opens the agent page', async ({ page }) => {
  await openAgent(page);
  await expect(tid(page, 'agent-title')).toHaveText('AI Agent');
  await expect(tid(page, 'agent-greeting')).toContainText('ich bin euer Housekeeping-Agent');
});

test('AC-001, AC-003: "KI zuerst" puts the agent in the middle and "Haushalt" first in ⊞', async ({
  page,
}) => {
  await chooseView(page, 'normal');
  await open(page, '/');
  await expect(tid(page, 'tab-haushalt')).toBeVisible();
  await chooseView(page, 'ai_first');
  await open(page, '/');
  const tabs = page.locator('[role="tab"]');
  await expect(tabs).toHaveCount(5);
  await expect(tabs.nth(2)).toHaveAttribute('data-testid', 'tab-agent');
  await expect(tid(page, 'tab-agent')).toHaveAccessibleName('AI Agent');
  await expect(tid(page, 'tab-agent')).toContainText('AI Agent');
  await expect(tid(page, 'tab-haushalt')).toHaveCount(0);
  await tid(page, 'tab-agent').click();
  await expect(tid(page, 'agent-screen')).toBeVisible();
  // The agent is a tab: the bar stays, there is no "Zurück".
  await expect(tid(page, 'tab-agent')).toHaveAttribute('aria-selected', 'true');
  await open(page, '/verwalten');
  await expect(page.locator('[data-testid^="manage-entry-"]').first()).toHaveAttribute(
    'data-testid',
    'manage-entry-household',
  );
  await expect(tid(page, 'manage-entry-agent')).toHaveCount(0);

  // AC-003: offline the choice is greyed out with the usual hint; the view stays.
  await open(page, '/');
  await goOffline(page);
  await openSettings(page);
  await expect(tid(page, 'app-view')).toHaveAttribute('aria-disabled', 'true');
  await expect(tid(page, 'app-view-offline')).toHaveText(
    'Offline – zum Bearbeiten brauchst du Netz',
  );
});

test('AC-005, AC-006, AC-007, AC-008: badges from the start page and the slash menu go into the request', async ({
  page,
  context,
}) => {
  // "Ausgehen" takes the device's location, as the research chat of spec 0066 did.
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 52.510612, longitude: 13.459487 });
  const sent: Record<string, unknown>[] = [];
  await stubAgent(page, sent);
  await openAgent(page);
  // AC-005: a tap on "Rezepte" sets the badge, the cursor stands behind it.
  await tid(page, 'agent-ability-rezepte').click();
  await expect(tid(page, 'agent-badge-rezepte')).toBeVisible();
  await expect(tid(page, 'agent-input')).toBeFocused();
  // AC-007: backspace right behind the badge removes it whole.
  await page.keyboard.press('Backspace');
  await expect(tid(page, 'agent-badge-rezepte')).toHaveCount(0);
  // AC-006: "/re" offers Rezepte and Ausgehen; the choice replaces "/re".
  await tid(page, 'agent-input').pressSequentially('/re');
  await expect(tid(page, 'agent-slash-rezepte')).toBeVisible();
  await expect(tid(page, 'agent-slash-ausgehen')).toBeVisible();
  await expect(tid(page, 'agent-slash-planen')).toHaveCount(0);
  await tid(page, 'agent-slash-rezepte').click();
  await expect(tid(page, 'agent-badge-rezepte')).toBeVisible();
  await expect(tid(page, 'agent-input')).toHaveValue('');
  // AC-008: a second badge, then the message.
  await tid(page, 'agent-input').pressSequentially('/aus');
  await tid(page, 'agent-slash-ausgehen').click();
  await tid(page, 'agent-input').fill('Vegetarische Rezepte, die wir lange nicht hatten');
  await tid(page, 'agent-send').click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({
    action: 'send',
    message: 'Vegetarische Rezepte, die wir lange nicht hatten',
    badges: ['rezepte', 'ausgehen'],
    attachments: [],
    place: { source: 'device', location: { lat: 52.511, lng: 13.459 } },
  });
  await expect(tid(page, 'agent-turn-0-meta')).toHaveText('Rezepte · Ausgehen');
  // AC-016: two tool calls are two step rows above the text.
  await expect(tid(page, 'agent-turn-1-steps-t1')).toContainText(
    'Liest eure Rezepte · vegan oder vegetarisch · 12 von 143',
  );
  await expect(tid(page, 'agent-turn-1-steps-t2')).toContainText(
    'Schaut in den Kalender · 30. Nov. – 6. Dez. · 4 Einträge',
  );
  await tid(page, 'agent-turn-1-steps-t1-toggle').click();
  await expect(tid(page, 'agent-turn-1-steps-t1-details')).toContainText(
    'Filter: Ernährung vegan oder vegetarisch',
  );
  await expect(tid(page, 'agent-turn-1-text')).toContainText('Mango-Curry');
  await expect(tid(page, 'agent-badge-rezepte')).toHaveCount(0);
});

test('AC-009: seven lines make the field 4.5 lines high, then it scrolls', async ({ page }) => {
  await openAgent(page);
  const input = tid(page, 'agent-input');
  await input.fill(['eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben'].join('\n'));
  const { height, lineHeight, padding, scrolls } = await input.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      height: node.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(style.lineHeight),
      // Decision 47: the slim bar centres one line in 46 pt, so the padding is no fixed 12.
      padding: Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
      scrolls: node.scrollHeight > node.clientHeight,
    };
  });
  expect(height).toBeCloseTo(padding + lineHeight * 4.5, 0);
  expect(scrolls).toBe(true);
});

test('AC-010, REQ-005: a .docx is refused, a PDF goes with the message', async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  await stubAgent(page, sent);
  await openAgent(page);
  // Without "Ausgehen" and without an allowed location nothing is asked: it goes without a place.
  const attach = async (name: string, mimeType: string) => {
    const chooser = page.waitForEvent('filechooser');
    await tid(page, 'agent-attach').click();
    await (await chooser).setFiles({ name, mimeType, buffer: Buffer.from('%PDF-1.4 test') });
  };
  await attach(
    'Rezept.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  await expect(tid(page, 'agent-attach-error')).toHaveText(
    'Dieses Format geht nicht – Fotos und PDF schon',
  );
  await expect(page.locator('[data-testid^="agent-attachment-"]')).toHaveCount(0);
  await attach('Rezept.pdf', 'application/pdf');
  await expect(page.locator('[data-testid^="agent-attachment-"]')).toHaveText('Rezept.pdf');
  await expect(tid(page, 'agent-attach-error')).toHaveCount(0);
  await tid(page, 'agent-send').click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({
    message: '',
    attachments: [{ kind: 'pdf', name: 'Rezept.pdf' }],
    place: { source: 'device' },
  });
  expect((sent[0]?.place as { location?: unknown }).location).toBeUndefined();
  expect(String((sent[0]?.attachments as { dataUrl: string }[])[0]?.dataUrl)).toMatch(
    /^data:application\/pdf;base64,/,
  );
  // Decision 32: a message sent just now shows its files; only a loaded chat says "1 Anhang".
  await expect(tid(page, 'agent-turn-0-files')).toBeVisible();
});
