import { describe, expect, it } from 'vitest';

import { addFeedback, removeAbsences, saveAbsences, switchHousehold } from './commands-household';
import { createRestaurant } from './commands-restaurants';
import { DEMO_HOUSEHOLD_ID, ENRICO, NADJA, TEST_HOUSEHOLD_ID } from './seed/demo';
import { getData, getState, resetState } from './store';
import { withDemoHousehold } from './test-helpers';

withDemoHousehold();

describe('household commands', () => {
  it('AC-039: new feedback has status "neu"; empty feedback fails', () => {
    const id = addFeedback({ kind: 'idea', text: 'Liste nach Rezept gruppieren' });
    expect(getData().feedback[0]).toMatchObject({ id, status: 'new', authorId: ENRICO });
    expect(() => addFeedback({ kind: 'idea', text: '  ' })).toThrow('Der Text fehlt.');
  });

  it('AC-002: the household "Test" has no restaurants; unknown households are ignored', () => {
    switchHousehold(TEST_HOUSEHOLD_ID);
    expect(getData().restaurants).toEqual([]);
    switchHousehold('hh-weg');
    expect(getState().activeHouseholdId).toBe(TEST_HOUSEHOLD_ID);
    switchHousehold(DEMO_HOUSEHOLD_ID);
    expect(getData().household.name).toBe('Enrico & Nadja');
  });

  it('starts from the seed again after resetState', () => {
    createRestaurant({ name: 'Weg damit' });
    resetState();
    expect(getData().restaurants.some((r) => r.name === 'Weg damit')).toBe(false);
  });
});

describe('absences (spec 0010, REQ-010)', () => {
  const mallorca = { from: '2027-01-01', to: '2027-01-04', note: 'Urlaub Mallorca' };
  const ours = () =>
    getData().absences.filter(
      (absence) => absence.from === '2027-01-01' || absence.note === 'Arzt',
    );

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
    expect(getData().absences).toBe(before);
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
