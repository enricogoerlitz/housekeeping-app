// Article commands (spec 0007, REQ-005 to REQ-007): create, edit, confirm, delete with
// "Rückgängig" and merge, each one change to the server (apply_changes or its own RPC).
import {
  filterRecipes,
  groupItems,
  normalizeText,
  searchArticleCatalog,
  type Article,
} from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, withBackend } from './backend-test-helpers';
import {
  catalogChoice,
  confirmArticle,
  createArticle,
  deleteArticle,
  mergeArticles,
  updateArticle,
} from './commands-articles';
import { setOffline } from './commands-household';
import { addShoppingItemFromText, pantryCheckRows, setItemChecked } from './commands-shopping';
import { indexById } from './queries';
import { NADJA } from './seed/demo';
import { starterCatalogEntries } from './starter/entries';
import { commit, getData, OfflineError, snapshot, updateData } from './store';
import { TransportError, type ChangeOp } from './transport';

const fx = withBackend();

const opsOf = (index: number) => (fx.calls[index]?.args[1] ?? []) as ChangeOp[];
const byName = (name: string): Article => {
  const found = getData().articles.find((article) => article.name === name);
  if (!found) throw new Error(`article ${name} missing`);
  return found;
};
const rejections = () => {
  const messages: string[] = [];
  const stop = onWriteRejected((message) => messages.push(message));
  return { messages, stop };
};

/** "Milchkokos" (Synonym "Kokosdrink", Neu aus Rezepten) in "Curry" and open on the list. */
function seedMilchkokos(): void {
  fx.server.insertRows(H, {
    articles: [
      {
        id: 'a-mk',
        name: 'Milchkokos',
        name_key: 'milchkokos',
        synonyms: ['Kokosdrink'],
        synonym_keys: ['kokosdrink'],
        area_id: null,
        diet: 'unknown',
        is_pantry: false,
        default_shopping_rule: null,
        needs_review: true,
      },
    ],
    recipes: [
      {
        id: 'r-curry',
        title: 'Curry',
        servings: 2,
        course: 'main',
        tags: [],
        variants: [],
        steps: [],
        cooked_count: 0,
        ingredients: [{ id: 'i-mk', articleId: 'a-mk', shoppingRule: 'count', name: 'Milchkokos' }],
      },
    ],
    shopping_items: [{ id: 'i-milchkokos', article_id: 'a-mk' }],
    shopping_contributions: [
      {
        id: 'c-milchkokos',
        item_id: 'i-milchkokos',
        source: { kind: 'manual' },
        count: 1,
        qty: null,
        unit: null,
        note: 'Bio',
      },
    ],
  });
}

describe('createArticle', () => {
  it('AC-026, AC-002: a new article is one insert, without area, diet unknown, not in review', async () => {
    await fx.startEnrico();
    const id = createArticle({ name: '  Drachenfrucht ' });
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual([
      {
        kind: 'insert',
        table: 'articles',
        row: expect.objectContaining({
          id,
          name: 'Drachenfrucht',
          name_key: 'drachenfrucht',
          area_id: null,
          diet: 'unknown',
          is_pantry: false,
          needs_review: false,
        }),
      },
    ]);
    expect(fx.server.row(H, 'articles', id)).toMatchObject({ name: 'Drachenfrucht' });
    expect(byName('Drachenfrucht').createdAt).not.toBe('');
  });

  it('AC-030, AC-043: a taken or missing name saves nothing', async () => {
    await fx.startEnrico();
    expect(() => createArticle({ name: 'kokosmilch' })).toThrow('Gibt es schon: Kokosmilch');
    expect(() => createArticle({ name: 'Karotten' })).toThrow('Gibt es schon: Möhren');
    expect(() => createArticle({ name: '   ' })).toThrow('Name fehlt');
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('offline: refused with the hint, nothing is sent', async () => {
    await fx.startEnrico();
    setOffline(true);
    expect(() => createArticle({ name: 'Drachenfrucht' })).toThrow(OfflineError);
    expect(() => createArticle({ name: 'Drachenfrucht' })).toThrow(
      'Offline – zum Bearbeiten brauchst du Netz',
    );
  });
});

describe('updateArticle', () => {
  it('AC-029: renaming shows the new name everywhere and leaves "Neu aus Rezepten"', async () => {
    seedMilchkokos();
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    updateArticle('a-mk', { name: 'Kokosnussmilch2' });
    await fx.settle(nadja);
    expect(opsOf(0)).toEqual([
      {
        kind: 'patch',
        table: 'articles',
        id: 'a-mk',
        changes: { name: 'Kokosnussmilch2', name_key: 'kokosnussmilch2', needs_review: false },
      },
    ]);
    const seen = fx.nadjaData(nadja).articles.find((article) => article.id === 'a-mk');
    expect(seen).toMatchObject({ name: 'Kokosnussmilch2', needsReview: false });
  });

  it('AC-032: area, Vorrat and diet reach the list, the pantry check and the "Vegan" filter', async () => {
    seedMilchkokos();
    await fx.startEnrico();
    const konserven = getData().areas.find((area) => area.name === 'Konserven & Saucen');
    if (!konserven) throw new Error('fixture');
    const listGroupOf = (itemId: string) => {
      const data = getData();
      return groupItems(data.items, indexById(data.articles), data.areas).find((group) =>
        group.items.some((item) => item.id === itemId),
      )?.title;
    };
    const veganRecipes = () => {
      const data = getData();
      return filterRecipes(
        data.recipes,
        { diet: 'vegan' },
        indexById(data.articles),
        '2026-11-20',
        {
          recipesById: indexById(data.recipes),
          collectionRecipes: data.collectionRecipes,
        },
      );
    };
    const curryRow = () =>
      pantryCheckRows([], [{ recipeId: 'r-curry', portions: 2 }]).find(
        (row) => row.articleId === 'a-mk',
      );
    expect(listGroupOf('i-milchkokos')).toBe('Ohne Bereich');
    expect(curryRow()?.isPantry).toBe(false);
    expect(veganRecipes().map((recipe) => recipe.id)).not.toContain('r-curry');

    updateArticle('a-mk', { areaId: konserven.id, isPantry: true, diet: 'vegan' });
    await fx.settle();

    expect(fx.server.row(H, 'articles', 'a-mk')).toMatchObject({
      area_id: konserven.id,
      is_pantry: true,
      diet: 'vegan',
    });
    expect(listGroupOf('i-milchkokos')).toBe('Konserven & Saucen');
    expect(curryRow()?.isPantry).toBe(true);
    expect(veganRecipes().map((recipe) => recipe.id)).toContain('r-curry');
  });

  it('AC-035: the patch carries only the changed column, so a parallel rename survives', async () => {
    await fx.startEnrico();
    const milk = byName('Milch');
    fx.server.insertRows(H, {
      articles: [
        { ...fx.server.row(H, 'articles', milk.id), id: milk.id, name: 'Vollmilch frisch' },
      ],
    });
    updateArticle(milk.id, { areaId: null });
    await fx.settle();
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'articles', id: milk.id, changes: { area_id: null } },
    ]);
    expect(fx.server.row(H, 'articles', milk.id)).toMatchObject({
      name: 'Vollmilch frisch',
      area_id: null,
    });
  });

  it("AC-031: synonyms are cleaned and stored with their keys; another article's name is refused", async () => {
    await fx.startEnrico();
    const coconut = byName('Kokosmilch');
    updateArticle(coconut.id, { synonyms: [...coconut.synonyms, ' Kokos-Milch ', 'kokosmilch'] });
    await fx.settle();
    expect(fx.server.row(H, 'articles', coconut.id)).toMatchObject({
      synonyms: [...coconut.synonyms, 'Kokos-Milch'],
      synonym_keys: [...coconut.synonyms, 'Kokos-Milch'].map(normalizeText),
    });
    expect(() => updateArticle(coconut.id, { synonyms: ['Möhren'] })).toThrow(
      '„Möhren“ ist schon ein Artikel',
    );
    expect(() => updateArticle(coconut.id, { name: 'Milch' })).toThrow('Gibt es schon: Milch');
    expect(() => updateArticle(coconut.id, { name: ' ' })).toThrow('Name fehlt');
  });

  it('AC-032: area, Vorrat, diet and the Standard-Einkaufsregel are one patch', async () => {
    seedMilchkokos();
    await fx.startEnrico();
    const area = getData().areas.find((candidate) => candidate.name === 'Konserven & Saucen');
    updateArticle('a-mk', {
      areaId: area?.id,
      isPantry: true,
      diet: 'vegan',
      defaultShoppingRule: 'recipeAmount',
    });
    await fx.settle();
    expect(fx.server.row(H, 'articles', 'a-mk')).toMatchObject({
      area_id: area?.id,
      is_pantry: true,
      diet: 'vegan',
      default_shopping_rule: 'recipeAmount',
      needs_review: false,
    });
  });

  it('a refusal of the server (name taken meanwhile) jumps back with the hint', async () => {
    await fx.startEnrico();
    const { messages, stop } = rejections();
    const milk = byName('Milch');
    fx.server.failNext('apply_changes', new TransportError('permanent', 'name_taken', 409));
    updateArticle(milk.id, { name: 'Frischmilch' });
    await fx.settle();
    expect(byName('Milch').id).toBe(milk.id);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });
});

describe('confirmArticle ("Passt so")', () => {
  it('open question 1: confirming leaves "Neu aus Rezepten"; a reviewed article sends nothing', async () => {
    seedMilchkokos();
    await fx.startEnrico();
    confirmArticle('a-mk');
    confirmArticle('a-mk');
    await fx.settle();
    expect(fx.calls).toHaveLength(1);
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'articles', id: 'a-mk', changes: { needs_review: false } },
    ]);
  });
});

describe('deleteArticle', () => {
  it('AC-033: an unused article is deleted with its RPC; "Rückgängig" inserts it again', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = createArticle({ name: 'Drachenfrucht', synonyms: ['Pitahaya'] });
    await fx.settle();
    fx.clearCalls();
    const restore = snapshot();
    deleteArticle(id);
    expect(getData().articles.some((article) => article.id === id)).toBe(false);
    await fx.settle(nadja);
    expect(fx.calls).toEqual([{ fn: 'deleteArticle', args: [id] }]);
    expect(fx.server.row(H, 'articles', id)).toBeUndefined();
    expect(fx.nadjaData(nadja).articles.some((article) => article.id === id)).toBe(false);

    restore();
    await fx.settle();
    expect(fx.calls[1]?.fn).toBe('applyChanges');
    const [insert] = opsOf(1);
    expect(insert).toMatchObject({ kind: 'insert', table: 'articles' });
    expect(Object.keys(insert?.kind === 'insert' ? insert.row : {}).sort()).toEqual(
      [
        'area_id',
        'default_shopping_rule',
        'diet',
        'id',
        'is_pantry',
        'name',
        'name_key',
        'needs_review',
        'synonym_keys',
        'synonyms',
      ].sort(),
    );
    expect(fx.server.row(H, 'articles', id)).toMatchObject({ synonyms: ['Pitahaya'] });
    expect(byName('Drachenfrucht').id).toBe(id);
  });

  it('AC-034: an article in a recipe or on the list is not deleted; the reason is the hint', async () => {
    await fx.startEnrico();
    expect(() => deleteArticle(byName('Kokosmilch').id)).toThrow(
      /^Wird in \d+ Rezept(en)? verwendet – zusammenführen statt löschen$/,
    );
    expect(() => deleteArticle(byName('Geschenkpapier').id)).toThrow('Steht auf der Einkaufsliste');
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-034: used meanwhile on another device: the server refuses and the article comes back', async () => {
    await fx.startEnrico();
    const { messages, stop } = rejections();
    const id = createArticle({ name: 'Drachenfrucht' });
    await fx.settle();
    fx.server.failNext('delete_article', new TransportError('permanent', 'article_in_use', 400));
    deleteArticle(id);
    await fx.settle();
    expect(byName('Drachenfrucht').id).toBe(id);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });
  it('E4: a diff never sends an article delete, even when declared; only delete_article does', async () => {
    await fx.startEnrico();
    const id = createArticle({ name: 'Drachenfrucht' });
    await fx.settle();
    fx.clearCalls();
    expect(() =>
      commit({ path: 'diff', maxDeletes: { articles: 1 } }, () =>
        updateData((data) => ({
          ...data,
          articles: data.articles.filter((article) => article.id !== id),
        })),
      ),
    ).toThrow('delete_article');
    expect(byName('Drachenfrucht').id).toBe(id);
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });
});

describe('mergeArticles', () => {
  it('AC-036: one RPC; recipe, the open item and the synonyms move to the target at once', async () => {
    seedMilchkokos();
    await fx.startEnrico();
    addShoppingItemFromText('Kokosmilch');
    await fx.settle();
    fx.clearCalls();
    const target = byName('Kokosmilch');

    expect(mergeArticles('a-mk', target.id)).toEqual({ recipes: 1, items: 1 });
    const local = getData();
    expect(local.articles.some((article) => article.id === 'a-mk')).toBe(false);
    expect(local.recipes.find((recipe) => recipe.id === 'r-curry')?.ingredients[0]?.articleId).toBe(
      target.id,
    );
    const open = local.items.filter((item) => item.articleId === target.id && !item.checked);
    expect(open).toHaveLength(1);
    expect(open[0]?.contributions.map((contribution) => contribution.note)).toContain('Bio');
    expect(byName('Kokosmilch').synonyms).toEqual([...target.synonyms, 'Milchkokos', 'Kokosdrink']);

    await fx.settle();
    expect(fx.calls).toEqual([{ fn: 'mergeArticles', args: ['a-mk', target.id] }]);
    expect(fx.server.row(H, 'articles', 'a-mk')).toBeUndefined();
    expect(fx.server.row(H, 'shopping_items', 'i-milchkokos')).toBeUndefined();
    expect(byName('Kokosmilch').synonyms).toContain('Milchkokos');
  });

  it('AC-037: afterwards "Milchkokos" in "Was fehlt?" finds Kokosmilch, no new article', async () => {
    seedMilchkokos();
    await fx.startEnrico();
    const target = byName('Kokosmilch');
    mergeArticles('a-mk', target.id);
    await fx.settle();
    const count = getData().articles.length;
    expect(addShoppingItemFromText('Milchkokos')).toMatchObject({
      articleName: 'Kokosmilch',
      createdArticle: false,
    });
    await fx.settle();
    expect(getData().articles).toHaveLength(count);
  });

  it('AC-040: a check queued offline on the source reaches the target after the merge, without a hint', async () => {
    seedMilchkokos();
    fx.server.insertRows(H, {
      shopping_items: [{ id: 'i-kokosmilch', article_id: 'art-kokosmilch' }],
      shopping_contributions: [
        {
          id: 'c-kokosmilch',
          item_id: 'i-kokosmilch',
          source: { kind: 'manual' },
          count: 1,
          qty: null,
          unit: null,
          note: null,
        },
      ],
    });
    await fx.startEnrico();
    const { messages, stop } = rejections();
    fx.environment.setOnline(false);
    setItemChecked('i-milchkokos', true);
    // Meanwhile Nadja merges with network.
    await fx.server.transport(NADJA).mergeArticles('a-mk', 'art-kokosmilch');
    fx.environment.setOnline(true);
    await fx.settle();
    expect(fx.server.row(H, 'shopping_items', 'i-kokosmilch')).toMatchObject({ checked: true });
    expect(
      getData().items.find((item) => item.articleId === 'art-kokosmilch' && item.checked),
    ).toBeDefined();
    expect(messages).toEqual([]);
    stop();
  });

  it('AC-041, open question 11: the same article and too many synonyms are refused before sending', async () => {
    seedMilchkokos();
    await fx.startEnrico();
    const target = byName('Kokosmilch');
    expect(() => mergeArticles('a-mk', 'a-mk')).toThrow();
    const words = Array.from({ length: 29 }, (_, index) => `Wort ${index}`);
    updateArticle(target.id, { synonyms: words });
    await fx.settle();
    fx.clearCalls();
    expect(() => mergeArticles('a-mk', target.id)).toThrow(
      'Zu viele Synonyme – entferne zuerst welche bei Kokosmilch',
    );
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('open question 11: refused by the server (synonyms added meanwhile): back, with its hint', async () => {
    seedMilchkokos();
    await fx.startEnrico();
    const { messages, stop } = rejections();
    const target = byName('Kokosmilch');
    fx.server.failNext('merge_articles', new TransportError('permanent', 'too_many_synonyms', 400));
    mergeArticles('a-mk', target.id);
    await fx.settle();
    expect(getData().articles.some((article) => article.id === 'a-mk')).toBe(true);
    expect(messages).toEqual(['Zu viele Synonyme – entferne zuerst welche bei Kokosmilch']);
    stop();
  });
});

describe('catalogChoice', () => {
  it('AC-003: a starter entry the household lacks becomes its article with the starter data', async () => {
    const grapefruit = fx.server.rows(H, 'articles').find((row) => row.name === 'Grapefruit');
    if (!grapefruit) throw new Error('fixture');
    fx.server.deleteRow(H, 'articles', grapefruit.id);
    await fx.startEnrico();
    const [hit] = searchArticleCatalog('Grapef', getData().articles, starterCatalogEntries).matches;
    expect(hit?.item.kind).toBe('starter');
    if (!hit) throw new Error('fixture');

    const article = catalogChoice(hit.item);
    await fx.settle();
    const area = getData().areas.find((candidate) => candidate.name === 'Obst & Gemüse');
    expect(article).toMatchObject({
      name: 'Grapefruit',
      synonyms: ['Pampelmuse'],
      areaId: area?.id,
      diet: 'vegan',
      isPantry: false,
      needsReview: false,
    });
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(fx.server.row(H, 'articles', article.id)).toMatchObject({ name: 'Grapefruit' });
  });

  it('AC-001: an article hit is the article itself; nothing is sent', async () => {
    await fx.startEnrico();
    const [hit] = searchArticleCatalog(
      'Kokosmilch',
      getData().articles,
      starterCatalogEntries,
    ).matches;
    if (!hit) throw new Error('fixture');
    expect(catalogChoice(hit.item).id).toBe(byName('Kokosmilch').id);
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });
});
