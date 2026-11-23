// Editing a planned dish (spec 0021): portions that follow eaters and guests (REQ-006) and the
// shopping list that follows the portions (REQ-007) or loses the entry's contributions when it is
// removed (REQ-015). Spec 0025 builds the list schema; the list rules live only here, so it can
// adapt them in one place.
import { splitVariants } from './meal-plan';
import { addContribution } from './shopping';
import { defaultVariantId } from './recipe-variants';
import type { PlannedContribution } from './shopping';
import type {
  Article,
  Id,
  Member,
  PlanEntryVariant,
  Recipe,
  ShoppingContribution,
  ShoppingItem,
} from './types';

/** meal_plan_entries_text_length and _note_length. */
export const MAX_ENTRY_TEXT = 500;
export const MAX_ENTRY_NOTE = 120;

// meal_plan_entries_text_no_control/_no_format and _note_no_control/_no_format: control
// characters and the invisible or direction-changing ones, as for the reminder's text.
const CONTROL =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/;

export type FieldCheck = { ok: true; value: string | undefined } | { ok: false; error: string };

function checkField(input: string, max: number, required: boolean): FieldCheck {
  const value = input.trim();
  if (value === '')
    return required
      ? { ok: false, error: 'Bitte etwas eintragen' }
      : { ok: true, value: undefined };
  if (CONTROL.test(value)) return { ok: false, error: 'Ohne Zeilenumbrüche' };
  if ([...value].length > max) return { ok: false, error: `Höchstens ${max} Zeichen` };
  return { ok: true, value };
}

/** "Was gibt es?" of a free text (REQ-008, AC-022): required, at most 500, no line break. */
export function checkEntryText(input: string): FieldCheck {
  return checkField(input, MAX_ENTRY_TEXT, true);
}

/** "Zusatz" of any entry (REQ-008, AC-024): empty is none, at most 120, no line break. */
export function checkEntryNote(input: string): FieldCheck {
  return checkField(input, MAX_ENTRY_NOTE, false);
}

/** meal_plan_entries_portions_valid and _guests_valid. */
export const MAX_PORTIONS = 1000;
export const MAX_GUESTS = 100;

/**
 * Who eats and how much: `variants` has one row per variant of the recipe (also with 0) while it
 * is edited, none for recipes without variants, collections and restaurants.
 */
export interface PortionState {
  eaterIds: Id[];
  guests: number;
  portions: number;
  variants: PlanEntryVariant[];
}

export interface PortionContext {
  /** Undefined for a restaurant: no portions, only eaters and guests. */
  recipe?: Recipe;
  members: readonly Member[];
  articlesById: Record<Id, Article>;
}

const sum = (variants: readonly PlanEntryVariant[]) =>
  variants.reduce((total, row) => total + row.portions, 0);

/** The rows of every variant of the recipe in its order, missing ones with 0. */
export function variantRows(
  recipe: Recipe | undefined,
  stored: readonly PlanEntryVariant[],
  portions: number,
): PlanEntryVariant[] {
  if (!recipe || recipe.variants.length === 0) return [];
  // An entry stored without a split eats the default variant (contributionsFromEntry does so too).
  const defaultId = defaultVariantId(recipe);
  return recipe.variants.map((variant) => ({
    variantId: variant.id,
    portions:
      stored.length === 0
        ? variant.id === defaultId
          ? portions
          : 0
        : stored
            .filter((row) => row.variantId === variant.id)
            .reduce((total, row) => total + row.portions, 0),
  }));
}

/** What planning offers first (AC-017): one portion per person, split as splitVariants does. */
export function portionsFor(eaterIds: Id[], guests: number, context: PortionContext): PortionState {
  const eaters = context.members.filter((member) => eaterIds.includes(member.id));
  const portions = eaterIds.length + guests;
  if (!context.recipe || context.recipe.variants.length === 0) {
    return { eaterIds, guests, portions, variants: [] };
  }
  const split = splitVariants(context.recipe, eaters, guests, context.articlesById);
  return { eaterIds, guests, portions, variants: variantRows(context.recipe, split.variants, 0) };
}

/** The variant a person (or, without one, a guest) gets when planning. */
function variantOf(member: Member | undefined, context: PortionContext): Id | undefined {
  const recipe = context.recipe;
  if (!recipe || recipe.variants.length === 0) return undefined;
  if (!member) return defaultVariantId(recipe);
  return (
    splitVariants(recipe, [member], 0, context.articlesById).variants[0]?.variantId ??
    defaultVariantId(recipe)
  );
}

function addPortion(state: PortionState, variantId: Id | undefined, delta: 1 | -1): PortionState {
  if (state.variants.length === 0 || variantId === undefined) {
    return { ...state, portions: Math.min(MAX_PORTIONS, Math.max(0, state.portions + delta)) };
  }
  let target = variantId;
  if (
    delta === -1 &&
    (state.variants.find((row) => row.variantId === target)?.portions ?? 0) <= 0
  ) {
    // Nothing left on her variant: the one with the most portions gives (REQ-006).
    const most = [...state.variants].sort((a, b) => b.portions - a.portions)[0];
    if (!most || most.portions <= 0) return state;
    target = most.variantId;
  }
  if (delta === 1 && sum(state.variants) >= MAX_PORTIONS) return state;
  const variants = state.variants.map((row) =>
    row.variantId === target ? { ...row, portions: row.portions + delta } : row,
  );
  return { ...state, variants, portions: sum(variants) };
}

/**
 * Another choice of "Wer isst mit?" and guests (REQ-006, Decision 7): every person or guest more
 * or less changes the portions by one, on the variant she would get when planning (a guest: the
 * default); counted by hand stays.
 */
export function changeEaters(
  state: PortionState,
  next: { eaterIds: Id[]; guests: number },
  context: PortionContext,
): PortionState {
  const guests = Math.min(MAX_GUESTS, Math.max(0, next.guests));
  let result: PortionState = { ...state, eaterIds: next.eaterIds, guests };
  const memberOf = (id: Id) => context.members.find((member) => member.id === id);
  for (const id of state.eaterIds) {
    if (!next.eaterIds.includes(id))
      result = addPortion(result, variantOf(memberOf(id), context), -1);
  }
  for (const id of next.eaterIds) {
    if (!state.eaterIds.includes(id))
      result = addPortion(result, variantOf(memberOf(id), context), 1);
  }
  const guestVariant = variantOf(undefined, context);
  for (let step = state.guests; step < guests; step += 1)
    result = addPortion(result, guestVariant, 1);
  for (let step = state.guests; step > guests; step -= 1)
    result = addPortion(result, guestVariant, -1);
  return result;
}

/**
 * Whether "+" or "−" of the counter (or of one variant's counter) is possible (AC-018): no counter
 * below 0, the sum not below 1 while someone eats, at most 1000.
 */
export function canStepPortions(state: PortionState, delta: 1 | -1, variantId?: Id): boolean {
  const total = state.variants.length > 0 ? sum(state.variants) : state.portions;
  if (delta === 1) return total < MAX_PORTIONS;
  const eats = state.eaterIds.length + state.guests > 0;
  if (total - 1 < (eats ? 1 : 0)) return false;
  if (variantId === undefined) return state.variants.length === 0;
  return (state.variants.find((row) => row.variantId === variantId)?.portions ?? 0) > 0;
}

/** "+" or "−" counted by hand; nothing when `canStepPortions` says no. */
export function stepPortions(state: PortionState, delta: 1 | -1, variantId?: Id): PortionState {
  if (!canStepPortions(state, delta, variantId)) return state;
  if (variantId === undefined) return { ...state, portions: state.portions + delta };
  const variants = state.variants.map((row) =>
    row.variantId === variantId ? { ...row, portions: row.portions + delta } : row,
  );
  return { ...state, variants, portions: sum(variants) };
}

/** The variants as stored: rows with 0 portions are left out, like splitVariants does. */
export function storedVariants(state: PortionState): PlanEntryVariant[] {
  return state.variants.filter((row) => row.portions > 0);
}

// ---------- The shopping list (REQ-007, REQ-015) ----------

function ofEntry(contribution: ShoppingContribution, entryId: Id): boolean {
  return contribution.source.kind === 'recipe' && contribution.source.entryId === entryId;
}

/** Contributions the server puts on one article's item in the same call (`add_contributions`). */
export interface EntryAddition {
  articleId: Id;
  /** The item they land on locally: the article's item, or a new one with this id. */
  itemId: Id;
  contributions: ShoppingContribution[];
}

const withoutIds = (items: readonly ShoppingItem[]) =>
  JSON.stringify(
    items.map((item) => ({
      ...item,
      contributions: item.contributions.map(({ id: _id, ...rest }) => rest),
    })),
  );

/**
 * Puts the contributions of an entry on the list as "Auf die Einkaufsliste" would set them for
 * its new state (REQ-007), the way the server's `replace_entry_contributions` does it in the same
 * call: the entry's contributions on open items go, then `planned` is added (new ids, the Herkunft
 * stays) and an open item left empty goes. One item per article (spec 0025, REQ-013): an addition
 * joins the article's open item, reopens its checked item with the new amount or gets a new item.
 * Not added: articles whose checked item holds the entry's contribution (they stay as they are,
 * AC-021) and "Vorrat" articles that did not stand on an open item of the entry. When nothing of
 * the entry is on the list, nothing changes. `planned` is what
 * contributionsFromEntry/collectionContributions return; `additions` is what the server adds.
 */
export function recomputeEntryContributions(input: {
  items: readonly ShoppingItem[];
  entryId: Id;
  planned: readonly PlannedContribution[];
  articlesById: Record<Id, Article>;
  newId: () => Id;
  now: string;
}): { items: ShoppingItem[]; changed: boolean; additions: EntryAddition[] } {
  const { entryId } = input;
  const items = [...input.items];
  const holders = items.filter((item) => item.contributions.some((c) => ofEntry(c, entryId)));
  if (holders.length === 0) return { items, changed: false, additions: [] };

  // The Herkunft stays per dish: a collection labels each dish ("Grillabend · Würstchen (Sa)"),
  // and a recipe's planned label may lack the day, so the dish is matched without it.
  const existingSources = holders
    .flatMap((item) => item.contributions)
    .filter((contribution) => ofEntry(contribution, entryId))
    .map((contribution) => contribution.source)
    .filter((source) => source.kind === 'recipe');
  const dish = (label: string) => label.replace(/ \([^()]*\)$/, '');
  const sourceOf = (planned: PlannedContribution): ShoppingContribution['source'] =>
    existingSources.find((source) => dish(source.label) === dish(planned.label)) ?? {
      kind: 'recipe',
      recipeId: planned.recipeId,
      entryId,
      label: planned.label,
    };
  const keptArticles = new Set(holders.filter((item) => item.checked).map((i) => i.articleId));
  const openArticles = new Set(holders.filter((item) => !item.checked).map((i) => i.articleId));
  const emptied = new Set(holders.filter((item) => !item.checked).map((item) => item.id));

  let next = removeEntryContributions(items, entryId, { keepEmpty: true });
  const additions: EntryAddition[] = [];
  for (const planned of input.planned) {
    if (keptArticles.has(planned.articleId)) continue;
    const pantry = input.articlesById[planned.articleId]?.isPantry ?? planned.isPantry;
    if (pantry && !openArticles.has(planned.articleId)) continue;
    const contribution: ShoppingContribution = {
      id: input.newId(),
      source: sourceOf(planned),
      ...(planned.count === undefined ? {} : { count: planned.count }),
      ...(planned.qty === undefined ? {} : { qty: planned.qty }),
      ...(planned.unit === undefined ? {} : { unit: planned.unit }),
      ...(planned.note === undefined ? {} : { note: planned.note }),
    };
    const known = additions.find((addition) => addition.articleId === planned.articleId);
    const itemId =
      known?.itemId ??
      next.find((item) => item.articleId === planned.articleId)?.id ??
      input.newId();
    next = addContribution(next, planned.articleId, contribution, itemId, input.now);
    if (known) known.contributions.push(contribution);
    else additions.push({ articleId: planned.articleId, itemId, contributions: [contribution] });
  }
  next = next.filter((item) => !emptied.has(item.id) || item.contributions.length > 0);
  const changed = withoutIds(next) !== withoutIds(items);
  return { items: changed ? next : items, changed, additions };
}

/**
 * "+ Aus Kalender" for entries that already stand on the list (spec 0031, REQ-027): for an
 * entry with contributions on open items, those on the articles taken over are replaced, not
 * added to; on articles not taken over this time they stay. On the server this is one
 * `replace_entry_contributions` for `entryIds`, which removes all of the entries' contributions on
 * open items, so `additions` also brings back the kept ones (new ids, same Herkunft and amount).
 * An entry only on checked items has nothing to replace: its contributions reopen the item.
 * Without `entryIds` nothing is replaced and the additions are plain list additions.
 */
export function replacePlannedOnList(input: {
  items: readonly ShoppingItem[];
  additions: readonly { articleId: Id; contributions: readonly ShoppingContribution[] }[];
  newId: () => Id;
  now: string;
}): { items: ShoppingItem[]; entryIds: Id[]; additions: EntryAddition[] } {
  const takenOver = new Set(input.additions.map((addition) => addition.articleId));
  const planned = new Set(
    input.additions.flatMap((addition) =>
      addition.contributions.flatMap((c) =>
        c.source.kind === 'recipe' && c.source.entryId !== undefined ? [c.source.entryId] : [],
      ),
    ),
  );
  const entryIds = [...planned].filter((entryId) =>
    input.items.some(
      (item) => !item.checked && item.contributions.some((c) => ofEntry(c, entryId)),
    ),
  );
  const ofReplaced = (c: ShoppingContribution) =>
    c.source.kind === 'recipe' &&
    c.source.entryId !== undefined &&
    entryIds.includes(c.source.entryId);
  const kept = input.items.flatMap((item) =>
    item.checked || takenOver.has(item.articleId)
      ? []
      : item.contributions.filter(ofReplaced).map((c) => ({
          articleId: item.articleId,
          contributions: [{ ...c, id: input.newId() }],
        })),
  );
  const emptied = new Set(
    input.items
      .filter((item) => !item.checked && item.contributions.some(ofReplaced))
      .map((item) => item.id),
  );
  let next = input.items.map((item) =>
    emptied.has(item.id)
      ? { ...item, contributions: item.contributions.filter((c) => !ofReplaced(c)) }
      : item,
  );
  const additions: EntryAddition[] = [];
  for (const addition of [...input.additions, ...kept]) {
    for (const contribution of addition.contributions) {
      const known = additions.find((candidate) => candidate.articleId === addition.articleId);
      const itemId =
        known?.itemId ??
        next.find((item) => item.articleId === addition.articleId && !item.checked)?.id ??
        next.find((item) => item.articleId === addition.articleId)?.id ??
        input.newId();
      next = addContribution(next, addition.articleId, contribution, itemId, input.now);
      if (known) known.contributions.push(contribution);
      else additions.push({ articleId: addition.articleId, itemId, contributions: [contribution] });
    }
  }
  next = next.filter((item) => !emptied.has(item.id) || item.contributions.length > 0);
  return { items: next, entryIds, additions };
}

/**
 * What of the entry stands on the list (REQ-015): the Herkunft ("Lasagne (Sa)"), the number of
 * open items ("2 Zutaten") and of contributions; undefined when nothing open has one.
 */
export function entryListShare(
  items: readonly ShoppingItem[],
  entryId: Id,
): { label: string; articles: number; contributions: number } | undefined {
  const own = items
    .filter((item) => !item.checked)
    .map((item) => item.contributions.filter((contribution) => ofEntry(contribution, entryId)))
    .filter((contributions) => contributions.length > 0);
  const first = own[0]?.[0]?.source;
  if (!first || first.kind !== 'recipe') return undefined;
  return { label: first.label, articles: own.length, contributions: own.flat().length };
}

/**
 * How many open items hold contributions of these entries (spec 0023, Decision 15: the entries a
 * deleted recipe or collection takes along). Checked items do not count, as in entryListShare.
 */
export function entriesOnList(items: readonly ShoppingItem[], entryIds: readonly Id[]): number {
  const ids = new Set(entryIds);
  return items.filter(
    (item) =>
      !item.checked &&
      item.contributions.some(
        (c) =>
          c.source.kind === 'recipe' && c.source.entryId !== undefined && ids.has(c.source.entryId),
      ),
  ).length;
}

/**
 * "Zutaten auch von der Liste nehmen" (REQ-015, AC-041): only the entry's contributions on open
 * items go; an item with other contributions stays with them, an empty one goes, a checked one
 * stays as it is.
 */
export function removeEntryContributions(
  items: readonly ShoppingItem[],
  entryId: Id,
  options: { keepEmpty?: boolean } = {},
): ShoppingItem[] {
  return items.flatMap((item) => {
    if (item.checked || !item.contributions.some((c) => ofEntry(c, entryId))) return [item];
    const contributions = item.contributions.filter((c) => !ofEntry(c, entryId));
    return contributions.length > 0 || options.keepEmpty ? [{ ...item, contributions }] : [];
  });
}
