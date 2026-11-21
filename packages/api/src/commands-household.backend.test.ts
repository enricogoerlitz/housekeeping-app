// Household commands (spec 0003): absences, feedback and articles on the diff path,
// votes per member over their RPC, assigning an area through the store queue, and the household,
// invitation and membership calls that wait for the server.
import { beforeEach, describe, expect, it } from 'vitest';

import { berlinToday } from './backend';
import { H, withBackend } from './backend-test-helpers';
import {
  acceptInvitation,
  addFeedback,
  assignArticleArea,
  createHousehold,
  declineInvitation,
  inviteMember,
  removeAbsences,
  removeMember,
  saveAbsences,
  switchHousehold,
  toggleFeedbackVote,
  updateArticle,
} from './commands-household';
import { ENRICO, NADJA } from './seed/demo';
import { getData, getState, OfflineError, snapshot } from './store';

const fx = withBackend();

describe('diff path', () => {
  it('AC-013: an absence added here reaches the other device; undo of removing it re-inserts', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    saveAbsences({ replaceIds: [], memberIds: [NADJA], from: '2026-12-01', to: '2026-12-03' });
    const id = getData().absences[0]?.id;
    if (!id) throw new Error('no absence');
    await fx.settle(nadja);
    expect(fx.calls).toEqual([
      {
        fn: 'applyChanges',
        args: [
          H,
          [
            {
              kind: 'insert',
              table: 'absences',
              row: { id, member_id: NADJA, from_on: '2026-12-01', to_on: '2026-12-03', note: null },
            },
          ],
        ],
      },
    ]);
    expect(fx.nadjaData(nadja).absences.map((absence) => absence.id)).toEqual([id]);

    fx.clearCalls();
    const restore = snapshot();
    removeAbsences([id]);
    expect(getData().absences).toEqual([]);
    await fx.settle(nadja);
    expect(fx.calls[0]?.args[1]).toEqual([{ kind: 'delete', table: 'absences', id }]);
    expect(fx.nadjaData(nadja).absences).toEqual([]);

    restore();
    expect(getData().absences.map((absence) => absence.id)).toEqual([id]);
    await fx.settle(nadja);
    expect(fx.calls[1]?.args[1]).toEqual([
      expect.objectContaining({ kind: 'insert', table: 'absences', row: expect.anything() }),
    ]);
    expect(fx.server.row(H, 'absences', id)).toBeDefined();
    expect(fx.nadjaData(nadja).absences.map((absence) => absence.id)).toEqual([id]);
  });

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
    await expect(acceptInvitation('inv-x')).rejects.toThrow('Die Einladung gibt es nicht mehr.');
    await expect(declineInvitation('inv-x')).rejects.toThrow('Die Einladung gibt es nicht mehr.');
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
    expect(() => snapshot()).toThrow('Not signed in');
  });

  it('"today" is the Berlin date', async () => {
    expect(berlinToday(new Date('2026-11-20T22:59:00Z'))).toBe('2026-11-20');
    expect(berlinToday(new Date('2026-11-20T23:30:00Z'))).toBe('2026-11-21');
    expect(berlinToday(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01');
    await fx.startEnrico();
    expect(getState().today).toBe(berlinToday(new Date()));
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

describe('absences (spec 0010, REQ-010)', () => {
  const mallorca = { from: '2027-01-01', to: '2027-01-04', note: 'Urlaub Mallorca' };
  const ours = () =>
    getData().absences.filter(
      (absence) => absence.from === '2027-01-01' || absence.note === 'Arzt',
    );

  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-033: Enrico and Nadja chosen in "Enrico & Nadja" is one absence of the household', () => {
    saveAbsences({ replaceIds: [], memberIds: [ENRICO, NADJA], ...mallorca });
    expect(ours()).toEqual([expect.objectContaining({ memberId: undefined, ...mallorca })]);
  });

  it('AC-034: one person chosen is one absence of that person', () => {
    saveAbsences({ replaceIds: [], memberIds: [NADJA], ...mallorca });
    expect(ours().map((absence) => absence.memberId)).toEqual([NADJA]);
  });

  it('AC-036: editing replaces the rows of the stripe in one change', () => {
    saveAbsences({ replaceIds: [], memberIds: [ENRICO], ...mallorca });
    const [enricos] = ours();
    saveAbsences({
      replaceIds: [enricos?.id ?? ''],
      memberIds: [ENRICO, NADJA],
      ...mallorca,
      to: '2027-01-05',
    });
    expect(ours()).toEqual([
      expect.objectContaining({ memberId: undefined, from: '2027-01-01', to: '2027-01-05' }),
    ]);
    expect(getData().absences.some((absence) => absence.id === enricos?.id)).toBe(false);
  });

  it('AC-035, AC-044: "Bis" before "Von" or nobody chosen writes nothing; one day is fine', () => {
    const before = getData().absences;
    expect(() =>
      saveAbsences({ replaceIds: [], memberIds: [ENRICO], from: '2027-01-04', to: '2027-01-01' }),
    ).toThrow();
    expect(() =>
      saveAbsences({ replaceIds: [], memberIds: [], from: '2027-01-01', to: '2027-01-01' }),
    ).toThrow();
    expect(getData().absences).toEqual(before);
    saveAbsences({
      replaceIds: [],
      memberIds: [ENRICO],
      from: '2027-01-01',
      to: '2027-01-01',
      note: 'Arzt',
    });
    expect(ours()).toEqual([
      expect.objectContaining({ memberId: ENRICO, from: '2027-01-01', to: '2027-01-01' }),
    ]);
  });

  it('AC-037: removing a row deletes exactly its absences', () => {
    saveAbsences({ replaceIds: [], memberIds: [ENRICO], ...mallorca });
    saveAbsences({ replaceIds: [], memberIds: [NADJA], ...mallorca, to: '2027-01-07' });
    const count = getData().absences.length;
    const [first] = ours();
    removeAbsences([first?.id ?? '']);
    expect(getData().absences).toHaveLength(count - 1);
    expect(ours()).toHaveLength(1);
  });
});
