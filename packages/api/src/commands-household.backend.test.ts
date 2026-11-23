// Household commands (spec 0003): feedback and articles on the diff path (trips are in
// commands-trips.backend.test.ts), votes per member over their RPC, assigning an area through the store queue, and the household,
// invitation and membership calls that wait for the server.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncNow } from './backend';
import { H, withBackend } from './backend-test-helpers';
import {
  acceptInvitation,
  addFeedback,
  assignArticleArea,
  createHousehold,
  declineInvitation,
  inviteMember,
  removeMember,
  switchHousehold,
  toggleFeedbackVote,
} from './commands-household';
import { updateArticle } from './commands-articles';
import { ENRICO, NADJA } from './seed/demo';
import { getData, getState, OfflineError, snapshot } from './store';

const fx = withBackend();

describe('diff path', () => {
  it('feedback and article changes are one apply_changes call each', async () => {
    await fx.startEnrico();
    const feedbackId = addFeedback({ kind: 'idea', text: 'Dunkles Thema für die Liste' });
    const article = getData().articles.find((candidate) => candidate.name === 'Milch');
    if (!article) throw new Error('fixture');
    updateArticle(article.id, { isPantry: true, synonyms: ['Kuhmilch'] });
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges', 'applyChanges']);
    expect(fx.server.row(H, 'feedback', feedbackId)).toMatchObject({ author_id: ENRICO });
    expect(fx.calls[1]?.args[1]).toEqual([
      {
        kind: 'patch',
        table: 'articles',
        id: article.id,
        changes: { synonyms: ['Kuhmilch'], synonym_keys: ['kuhmilch'], is_pantry: true },
      },
    ]);
  });
});

describe('per member (rpc path)', () => {
  it('a vote goes through its RPC and undo takes it back', async () => {
    await fx.startEnrico();
    const entry = getData().feedback.find((candidate) => !candidate.votes.includes(ENRICO));
    if (!entry) throw new Error('fixture');
    const restore = snapshot();
    toggleFeedbackVote(entry.id);
    expect(getData().feedback.find((f) => f.id === entry.id)?.votes).toContain(ENRICO);
    await fx.settle();
    expect(fx.calls).toEqual([{ fn: 'setFeedbackVote', args: [entry.id, true] }]);
    restore();
    await fx.settle();
    expect(fx.calls[1]).toEqual({ fn: 'setFeedbackVote', args: [entry.id, false] });
    expect(getData().feedback.find((f) => f.id === entry.id)?.votes).not.toContain(ENRICO);
  });
});

describe('store queue: assign an area', () => {
  it('offline it applies locally and waits; online it is sent', async () => {
    const engine = await fx.startEnrico();
    const article = getData().articles.find((candidate) => candidate.name === 'Milch');
    const area = getData().areas.find((candidate) => candidate.id !== article?.areaId);
    if (!article || !area) throw new Error('fixture');
    engine.setSimulatedOffline(true);
    assignArticleArea(article.id, area.id);
    expect(getData().articles.find((a) => a.id === article.id)?.areaId).toBe(area.id);
    await fx.settle(engine);
    expect(fx.calls).toEqual([]);
    engine.setSimulatedOffline(false);
    await fx.settle(engine);
    expect(fx.calls).toEqual([{ fn: 'assignArticleArea', args: [article.id, area.id] }]);
    expect(fx.server.row(H, 'articles', article.id)).toMatchObject({ area_id: area.id });
  });

  it('online it is sent at once', async () => {
    const engine = await fx.startEnrico();
    const article = getData().articles.find((candidate) => candidate.areaId);
    if (!article) throw new Error('fixture');
    assignArticleArea(article.id, undefined);
    await fx.settle(engine);
    expect(fx.calls).toEqual([{ fn: 'assignArticleArea', args: [article.id, null] }]);
    expect(getData().articles.find((a) => a.id === article.id)?.areaId).toBeUndefined();
  });
});

describe('household, invitation, membership (wait for the server)', () => {
  it('AC-010: creating a household sends the starter and shows it after the pull', async () => {
    await fx.startEnrico();
    const id = await createHousehold('  WG Köln ');
    expect(fx.calls.map((call) => call.fn)).toEqual(['createHousehold']);
    const [name, starter] = fx.calls[0]?.args ?? [];
    expect(name).toBe('WG Köln');
    const payload = starter as { areas: unknown[]; articles: Record<string, unknown>[] };
    expect(payload.areas[0]).toEqual({ key: 'obst-gemuese', name: 'Obst & Gemüse' });
    expect(payload.articles.find((article) => article.name === 'Möhren')).toMatchObject({
      name_key: 'moehren',
      synonym_keys: expect.arrayContaining(['karotten']),
      area: 'obst-gemuese',
      diet: 'vegan',
      is_pantry: false,
    });
    expect(getState().households[id]?.household.name).toBe('WG Köln');
    expect(getState().activeHouseholdId).toBe(H);
  });

  it('AC-009: an invalid address is refused before anything is sent', async () => {
    await fx.startEnrico();
    await expect(inviteMember('nadja@')).rejects.toThrow('Das ist keine E-Mail-Adresse');
    expect(fx.calls).toEqual([]);
  });

  it('AC-008: an invitation goes to the active household; server errors come back in German', async () => {
    await fx.startEnrico();
    await inviteMember(' Lena@Example.com ');
    expect(fx.calls).toEqual([{ fn: 'inviteMember', args: [H, 'lena@example.com'] }]);
    await expect(inviteMember('nadja@example.com')).rejects.toThrow(
      'Diese Person ist schon Mitglied',
    );
  });

  it('removing a member, accepting and declining are single calls', async () => {
    await fx.startEnrico();
    await removeMember(NADJA);
    expect(fx.calls).toEqual([{ fn: 'removeMember', args: [H, NADJA] }]);
    await expect(removeMember(ENRICO)).rejects.toThrow(
      'Du bist das letzte Mitglied des Haushalts.',
    );
    await expect(acceptInvitation('inv-x')).rejects.toThrow('Diese Einladung gibt es nicht mehr.');
    await expect(declineInvitation('inv-x')).rejects.toThrow('Diese Einladung gibt es nicht mehr.');
  });

  it('offline these calls fail with the offline message and send nothing', async () => {
    const engine = await fx.startEnrico();
    engine.setSimulatedOffline(true);
    await expect(createHousehold('WG Köln')).rejects.toBeInstanceOf(OfflineError);
    await expect(inviteMember('lena@example.com')).rejects.toBeInstanceOf(OfflineError);
    expect(fx.calls).toEqual([]);
  });
});

describe('the signed-in user', () => {
  it('the current member is the signed-in user', async () => {
    await fx.startAs(NADJA);
    expect(getState().currentMemberId).toBe(NADJA);
  });

  it('without a sign-in there is no state, and commands are refused', () => {
    expect(() => getState()).toThrow();
    expect(() => addFeedback({ kind: 'idea', text: 'Etwas' })).toThrow();
    expect(() => snapshot()).toThrow('Du bist nicht angemeldet.');
  });

  it('AC-049 (0031): "today" is the date on the household clock, whatever the device says', async () => {
    // 00:00:30 in Berlin, still the evening before in UTC.
    vi.setSystemTime(new Date('2026-11-20T23:00:30Z'));
    await fx.startEnrico();
    expect(getState().today).toBe('2026-11-21');
  });

  it('AC-050 (0031): a household in New York has its own "today"', async () => {
    // 02:00 in Berlin is 20:00 the day before in New York.
    vi.setSystemTime(new Date('2026-11-21T01:00:00Z'));
    fx.server.addHousehold(
      { id: 'h-new-york', name: 'Haus in New York', timezone: 'America/New_York' },
      [ENRICO],
    );
    await fx.startEnrico();
    await fx.settle();
    expect(getState().today).toBe('2026-11-21');
    switchHousehold('h-new-york');
    await syncNow();
    expect(getState().activeHouseholdId).toBe('h-new-york');
    expect(getState().today).toBe('2026-11-20');
  });
});

describe('household commands: input and local effect', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-039: new feedback has status "neu"; empty feedback fails', () => {
    const id = addFeedback({ kind: 'idea', text: 'Liste nach Rezept gruppieren' });
    expect(getData().feedback.find((entry) => entry.id === id)).toMatchObject({
      status: 'new',
      authorId: ENRICO,
    });
    expect(() => addFeedback({ kind: 'idea', text: '  ' })).toThrow('Der Text fehlt.');
  });

  it('AC-002: an unknown household is ignored', () => {
    switchHousehold('hh-weg');
    expect(getState().activeHouseholdId).toBe(H);
    expect(getData().household.name).toBe('Enrico & Nadja');
  });
});
