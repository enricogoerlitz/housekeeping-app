import { describe, expect, it } from 'vitest';

import {
  canStepPortions,
  changeEaters,
  checkEntryNote,
  checkEntryText,
  entryListShare,
  MAX_GUESTS,
  MAX_PORTIONS,
  portionsFor,
  recomputeEntryContributions,
  removeEntryContributions,
  replacePlannedOnList,
  stepPortions,
  type PortionState,
} from './entry-edit';
import { articlesById, enrico, makeRecipe, mangoCurry, nadja } from './test-fixtures';
import type { Article, ShoppingContribution, ShoppingItem } from './types';
import type { PlannedContribution } from './shopping';

const lasagne = makeRecipe({ id: 'lasagne', title: 'Lasagne', servings: 2 });
const members = [enrico, nadja];
const tofu = mangoCurry.variants[0]?.id ?? '';
const huhn = mangoCurry.variants[1]?.id ?? '';

describe('portions follow eaters and guests (REQ-006, Decision 7)', () => {
  const one: PortionState = { eaterIds: ['enrico'], guests: 0, portions: 1, variants: [] };

  it('AC-015: Nadja dazu → 2, "+" → 3, Nadja ab → 2', () => {
    const two = changeEaters(
      one,
      { eaterIds: ['enrico', 'nadja'], guests: 0 },
      {
        recipe: lasagne,
        members,
        articlesById,
      },
    );
    expect(two.portions).toBe(2);
    const three = stepPortions(two, 1);
    expect(three.portions).toBe(3);
    const back = changeEaters(
      three,
      { eaterIds: ['enrico'], guests: 0 },
      {
        recipe: lasagne,
        members,
        articlesById,
      },
    );
    expect(back).toEqual({ eaterIds: ['enrico'], guests: 0, portions: 2, variants: [] });
  });

  it('AC-016: Hähnchen −, Tofu + → "mit Tofu 2", "mit Hähnchen 0"; a guest more → "mit Tofu 3"', () => {
    const curry: PortionState = {
      eaterIds: ['enrico', 'nadja'],
      guests: 0,
      portions: 2,
      variants: [
        { variantId: tofu, portions: 1 },
        { variantId: huhn, portions: 1 },
      ],
    };
    const changed = stepPortions(stepPortions(curry, -1, huhn), 1, tofu);
    expect(changed.variants).toEqual([
      { variantId: tofu, portions: 2 },
      { variantId: huhn, portions: 0 },
    ]);
    expect(changed.portions).toBe(2);
    const guest = changeEaters(
      changed,
      { eaterIds: ['enrico', 'nadja'], guests: 1 },
      {
        recipe: mangoCurry,
        members,
        articlesById,
      },
    );
    expect(guest.variants).toEqual([
      { variantId: tofu, portions: 3 },
      { variantId: huhn, portions: 0 },
    ]);
    expect(guest.portions).toBe(3);
  });

  it('REQ-006: leaving takes the portion from her variant, else from the one with the most', () => {
    const curry: PortionState = {
      eaterIds: ['enrico', 'nadja'],
      guests: 0,
      portions: 2,
      variants: [
        { variantId: tofu, portions: 2 },
        { variantId: huhn, portions: 0 },
      ],
    };
    // Enrico (flexible) would get Hähnchen, which has none: the portion comes from Tofu.
    const left = changeEaters(
      curry,
      { eaterIds: ['nadja'], guests: 0 },
      {
        recipe: mangoCurry,
        members,
        articlesById,
      },
    );
    expect(left.variants).toEqual([
      { variantId: tofu, portions: 1 },
      { variantId: huhn, portions: 0 },
    ]);
  });

  it('AC-018: "−" is greyed out at 1 portion while someone eats; deselected stands 0', () => {
    expect(canStepPortions(one, -1)).toBe(false);
    expect(canStepPortions(one, 1)).toBe(true);
    const nobody = changeEaters(
      one,
      { eaterIds: [], guests: 0 },
      {
        recipe: lasagne,
        members,
        articlesById,
      },
    );
    expect(nobody.portions).toBe(0);
    expect(canStepPortions({ ...one, portions: MAX_PORTIONS }, 1)).toBe(false);
    expect(MAX_GUESTS).toBe(100);
  });

  it('AC-018: no variant counter below 0, the sum not below 1', () => {
    const curry: PortionState = {
      eaterIds: ['enrico'],
      guests: 0,
      portions: 1,
      variants: [
        { variantId: tofu, portions: 1 },
        { variantId: huhn, portions: 0 },
      ],
    };
    expect(canStepPortions(curry, -1, huhn)).toBe(false);
    expect(canStepPortions(curry, -1, tofu)).toBe(false);
    expect(canStepPortions(curry, 1, huhn)).toBe(true);
  });

  it('AC-017: planning with two "+" for Enrico and Nadja gives 4 portions', () => {
    const start = portionsFor(['enrico', 'nadja'], 0, { recipe: lasagne, members, articlesById });
    expect(stepPortions(stepPortions(start, 1), 1).portions).toBe(4);
  });
});

// ---------- The list follows (REQ-007, REQ-015) ----------

const hack: Article = {
  ...articlesById['art-hack']!,
  id: 'hack',
  name: 'Hackfleisch',
  isPantry: false,
};
const platten: Article = { ...hack, id: 'platten', name: 'Lasagneplatten' };
const salz: Article = { ...hack, id: 'salz', name: 'Salz', isPantry: true };
const byId = { hack, platten, salz };
const source = {
  kind: 'recipe' as const,
  recipeId: 'lasagne',
  entryId: 'e1',
  label: 'Lasagne (Sa)',
};

function contribution(id: string, partial: Partial<ShoppingContribution>): ShoppingContribution {
  return { id, source, ...partial };
}
function item(
  id: string,
  articleId: string,
  contributions: ShoppingContribution[],
  checked = false,
): ShoppingItem {
  return { id, articleId, contributions, checked, createdAt: '2026-11-22T10:00:00Z' };
}
function planned(articleId: string, amount: Partial<PlannedContribution>): PlannedContribution {
  return {
    articleId,
    name: articleId,
    isPantry: articleId === 'salz',
    recipeId: 'lasagne',
    entryId: 'e1',
    label: 'Lasagne (Sa)',
    ...amount,
  };
}
let counter = 0;
const newId = () => `new-${++counter}`;
const now = '2026-11-22T12:00:00Z';

describe('recomputeEntryContributions (REQ-007)', () => {
  const list = [
    item('i-hack', 'hack', [contribution('c-hack', { qty: 250, unit: 'g' })]),
    item('i-platten', 'platten', [contribution('c-platten', { count: 1 })]),
  ];
  const fresh = (partial: Partial<ShoppingContribution>) =>
    expect.objectContaining({ ...partial, source, id: expect.stringMatching(/^new-/) });

  it('AC-019: 4 portions → "Hackfleisch 500 g", "Lasagneplatten 1×"; the Herkunft stays', () => {
    const result = recomputeEntryContributions({
      items: list,
      entryId: 'e1',
      planned: [planned('hack', { qty: 500, unit: 'g' }), planned('platten', { count: 1 })],
      articlesById: byId,
      newId,
      now,
    });
    expect(result.changed).toBe(true);
    expect(result.items).toEqual([
      { ...list[0], contributions: [fresh({ qty: 500, unit: 'g' })] },
      { ...list[1], contributions: [fresh({ count: 1 })] },
    ]);
    // What the server does in the same call (replace_entry_contributions): the same items.
    expect(result.additions).toEqual([
      { articleId: 'hack', itemId: 'i-hack', contributions: [fresh({ qty: 500, unit: 'g' })] },
      { articleId: 'platten', itemId: 'i-platten', contributions: [fresh({ count: 1 })] },
    ]);
  });

  it('review 0031: a collection keeps the Herkunft of each dish, not the first one', () => {
    const grill = { kind: 'recipe' as const, recipeId: 'grillabend', entryId: 'e2' };
    const salat = { ...grill, label: 'Grillabend · Kartoffelsalat (Sa)' };
    const wurst = { ...grill, label: 'Grillabend · Würstchen (Sa)' };
    const items = [
      item('i-hack', 'hack', [{ id: 'c1', source: salat, qty: 250, unit: 'g' }]),
      item('i-platten', 'platten', [{ id: 'c2', source: wurst, count: 1 }]),
    ];
    const result = recomputeEntryContributions({
      items,
      entryId: 'e2',
      planned: [
        { ...planned('hack', { qty: 500, unit: 'g' }), ...grill, label: salat.label },
        { ...planned('platten', { count: 2 }), ...grill, label: wurst.label },
      ],
      articlesById: byId,
      newId,
      now,
    });
    expect(result.items.map((each) => each.contributions[0]?.source)).toEqual([salat, wurst]);
  });

  it('AC-019: the same amounts again are no change', () => {
    const result = recomputeEntryContributions({
      items: list,
      entryId: 'e1',
      planned: [planned('hack', { qty: 250, unit: 'g' }), planned('platten', { count: 1 })],
      articlesById: byId,
      newId,
      now,
    });
    expect(result.changed).toBe(false);
  });

  it('AC-020: an ingredient that falls away goes, an empty item with it', () => {
    const result = recomputeEntryContributions({
      items: list,
      entryId: 'e1',
      planned: [planned('platten', { count: 1 })],
      articlesById: byId,
      newId,
      now,
    });
    expect(result.items.map((each) => each.id)).toEqual(['i-platten']);
    expect(result.additions.map((each) => each.articleId)).toEqual(['platten']);
  });

  it('REQ-007: a new ingredient comes onto the list, a new pantry article does not', () => {
    const result = recomputeEntryContributions({
      items: list,
      entryId: 'e1',
      planned: [
        planned('hack', { qty: 250, unit: 'g' }),
        planned('platten', { count: 1 }),
        planned('salz', { count: 1 }),
        planned('tofu', { qty: 200, unit: 'g' }),
      ],
      articlesById: { ...byId, tofu: { ...hack, id: 'tofu', name: 'Tofu' } },
      newId,
      now,
    });
    const tofuItem = result.items.find((each) => each.articleId === 'tofu');
    expect(tofuItem?.contributions).toEqual([fresh({ qty: 200, unit: 'g' })]);
    expect(result.additions.find((each) => each.articleId === 'tofu')?.itemId).toBe(tofuItem?.id);
    expect(result.items.some((each) => each.articleId === 'salz')).toBe(false);
    expect(result.additions.some((each) => each.articleId === 'salz')).toBe(false);
  });

  it('REQ-007: a pantry article that stood on the list from the entry follows', () => {
    const withSalz = [...list, item('i-salz', 'salz', [contribution('c-salz', { count: 1 })])];
    const result = recomputeEntryContributions({
      items: withSalz,
      entryId: 'e1',
      planned: [planned('salz', { count: 2 })],
      articlesById: byId,
      newId,
      now,
    });
    expect(result.items).toEqual([{ ...withSalz[2], contributions: [fresh({ count: 2 })] }]);
  });

  it('REQ-007 (spec 0025, REQ-013): a new ingredient whose article is checked reopens it with the new amount', () => {
    const bought = item(
      'i-tofu',
      'tofu',
      [{ id: 'c-old', source: { kind: 'manual' }, count: 1 }],
      true,
    );
    const result = recomputeEntryContributions({
      items: [...list, { ...bought, checkedAt: now, checkedBy: 'nadja' }],
      entryId: 'e1',
      planned: [
        planned('hack', { qty: 250, unit: 'g' }),
        planned('platten', { count: 1 }),
        planned('tofu', { qty: 200, unit: 'g' }),
      ],
      articlesById: { ...byId, tofu: { ...hack, id: 'tofu', name: 'Tofu' } },
      newId,
      now,
    });
    const tofuItem = result.items.find((each) => each.articleId === 'tofu');
    expect(tofuItem).toEqual({
      ...bought,
      checked: false,
      contributions: [fresh({ qty: 200, unit: 'g' })],
    });
    expect(result.items.filter((each) => each.articleId === 'tofu')).toHaveLength(1);
  });

  it('AC-041: a contribution of another origin on the same item stays', () => {
    const manual: ShoppingContribution = { id: 'c-hand', source: { kind: 'manual' }, count: 1 };
    const shared = [
      item('i-hack', 'hack', [contribution('c-hack', { qty: 250, unit: 'g' }), manual]),
    ];
    const result = recomputeEntryContributions({
      items: shared,
      entryId: 'e1',
      planned: [],
      articlesById: byId,
      newId,
      now,
    });
    expect(result.items).toEqual([item('i-hack', 'hack', [manual])]);
    expect(result.additions).toEqual([]);
  });

  it('AC-021: a checked item stays checked and unchanged', () => {
    const checked = [
      item('i-hack', 'hack', [contribution('c-hack', { qty: 250, unit: 'g' })], true),
    ];
    const result = recomputeEntryContributions({
      items: checked,
      entryId: 'e1',
      planned: [planned('hack', { qty: 500, unit: 'g' })],
      articlesById: byId,
      newId,
      now,
    });
    expect(result.items).toEqual(checked);
    expect(result.changed).toBe(false);
    expect(result.additions).toEqual([]);
  });

  it('REQ-007: nothing of the entry on the list changes nothing', () => {
    const other = [item('i-hack', 'hack', [{ id: 'c', source: { kind: 'manual' }, count: 1 }])];
    const result = recomputeEntryContributions({
      items: other,
      entryId: 'e1',
      planned: [planned('platten', { count: 1 })],
      articlesById: byId,
      newId,
      now,
    });
    expect(result).toEqual({ items: other, changed: false, additions: [] });
  });
});

describe('"+ Aus Kalender" again replaces instead of adding (spec 0031, REQ-027)', () => {
  const manual: ShoppingContribution = { id: 'c-hand', source: { kind: 'manual' }, count: 1 };
  const fresh = (partial: Partial<ShoppingContribution>) =>
    expect.objectContaining({ ...partial, id: expect.stringMatching(/^new-/) });
  const hack500 = () => contribution(newId(), { qty: 500, unit: 'g' });

  it('AC-064: Lasagne with 500 g Hackfleisch open on the list, taken over again → still 500 g', () => {
    const list = [item('i-hack', 'hack', [contribution('c-hack', { qty: 500, unit: 'g' })])];
    const result = replacePlannedOnList({
      items: list,
      additions: [{ articleId: 'hack', contributions: [hack500()] }],
      newId,
      now,
    });
    expect(result.entryIds).toEqual(['e1']);
    expect(result.items).toEqual([
      { ...list[0], contributions: [fresh({ qty: 500, unit: 'g', source })] },
    ]);
    expect(result.additions).toEqual([
      {
        articleId: 'hack',
        itemId: 'i-hack',
        contributions: [fresh({ qty: 500, unit: 'g', source })],
      },
    ]);
  });

  it('AC-064: other contributions on the item stay', () => {
    const list = [
      item('i-hack', 'hack', [manual, contribution('c-hack', { qty: 500, unit: 'g' })]),
    ];
    const result = replacePlannedOnList({
      items: list,
      additions: [{ articleId: 'hack', contributions: [hack500()] }],
      newId,
      now,
    });
    expect(result.items[0]?.contributions).toEqual([manual, fresh({ qty: 500, unit: 'g' })]);
  });

  it('AC-064: an article of the entry not taken over this time stays on the list as it was', () => {
    const list = [
      item('i-hack', 'hack', [contribution('c-hack', { qty: 500, unit: 'g' })]),
      item('i-platten', 'platten', [contribution('c-platten', { count: 1 })]),
    ];
    const result = replacePlannedOnList({
      items: list,
      additions: [{ articleId: 'hack', contributions: [hack500()] }],
      newId,
      now,
    });
    expect(result.items).toEqual([
      { ...list[0], contributions: [fresh({ qty: 500, unit: 'g' })] },
      { ...list[1], contributions: [fresh({ count: 1, source })] },
    ]);
    // The server removes all of the entry's contributions on open items, so it gets this one back.
    expect(result.additions).toContainEqual({
      articleId: 'platten',
      itemId: 'i-platten',
      contributions: [fresh({ count: 1, source })],
    });
  });

  it('AC-065: the Hackfleisch is checked → a new open item with 500 g, nothing to replace', () => {
    const list = [item('i-hack', 'hack', [contribution('c-hack', { qty: 500, unit: 'g' })], true)];
    const result = replacePlannedOnList({
      items: list,
      additions: [{ articleId: 'hack', contributions: [hack500()] }],
      newId,
      now,
    });
    expect(result.entryIds).toEqual([]);
    expect(result.items).toEqual([
      {
        id: 'i-hack',
        articleId: 'hack',
        checked: false,
        createdAt: list[0]?.createdAt,
        contributions: [fresh({ qty: 500, unit: 'g' })],
      },
    ]);
  });

  it('REQ-027: a recipe chosen directly (no plan entry) is added as before', () => {
    const list = [item('i-hack', 'hack', [contribution('c-hack', { qty: 500, unit: 'g' })])];
    const direct: ShoppingContribution = {
      id: 'new-direct',
      source: { kind: 'recipe', recipeId: 'lasagne', label: 'Lasagne' },
      qty: 250,
      unit: 'g',
    };
    const result = replacePlannedOnList({
      items: list,
      additions: [{ articleId: 'hack', contributions: [direct] }],
      newId,
      now,
    });
    expect(result.entryIds).toEqual([]);
    expect(result.items[0]?.contributions).toEqual([...(list[0]?.contributions ?? []), direct]);
  });
});

describe('removing an entry with its contributions (REQ-015)', () => {
  const manual: ShoppingContribution = { id: 'c-hand', source: { kind: 'manual' }, count: 1 };
  const list = [
    item('i-hack', 'hack', [contribution('c-hack', { qty: 250, unit: 'g' }), manual]),
    item('i-platten', 'platten', [contribution('c-platten', { count: 1 })]),
    item('i-alt', 'salz', [contribution('c-alt', { count: 1 })], true),
  ];

  it('AC-040: "Für Lasagne (Sa) stehen 2 Zutaten auf der Einkaufsliste."', () => {
    expect(entryListShare(list, 'e1')).toEqual({
      label: 'Lasagne (Sa)',
      articles: 2,
      contributions: 2,
    });
    expect(entryListShare([], 'e1')).toBeUndefined();
  });

  it('AC-041: only these contributions go; an item with other ones stays, a checked one too', () => {
    expect(removeEntryContributions(list, 'e1')).toEqual([
      item('i-hack', 'hack', [manual]),
      item('i-alt', 'salz', [contribution('c-alt', { count: 1 })], true),
    ]);
  });
});

describe('the typed fields of an entry (REQ-008)', () => {
  it('AC-022: "Was gibt es?" is required, at most 500 characters, without a line break', () => {
    expect(checkEntryText(' Essen bei Oma ')).toEqual({ ok: true, value: 'Essen bei Oma' });
    expect(checkEntryText('  ')).toEqual({ ok: false, error: 'Bitte etwas eintragen' });
    expect(checkEntryText('a\nb')).toEqual({ ok: false, error: 'Ohne Zeilenumbrüche' });
    expect(checkEntryText('x'.repeat(501))).toEqual({ ok: false, error: 'Höchstens 500 Zeichen' });
  });

  it('AC-024: the Zusatz is optional, at most 120 characters, without a line break', () => {
    expect(checkEntryNote(' doppelte Menge ')).toEqual({ ok: true, value: 'doppelte Menge' });
    expect(checkEntryNote('  ')).toEqual({ ok: true, value: undefined });
    expect(checkEntryNote('a\nb')).toEqual({ ok: false, error: 'Ohne Zeilenumbrüche' });
    expect(checkEntryNote('a\u202eb')).toEqual({ ok: false, error: 'Ohne Zeilenumbrüche' });
    expect(checkEntryNote('x'.repeat(121))).toEqual({ ok: false, error: 'Höchstens 120 Zeichen' });
  });
});
