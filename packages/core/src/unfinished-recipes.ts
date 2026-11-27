import type { Id, Recipe } from './types';

// Spec 0061: recipes entered quickly with only a name ("erst anlegen, dann ausfüllen") and the
// way through them one after the other. Computed from the recipe; nothing is stored.

/**
 * REQ-001: a recipe without ingredients and without steps — the same rule by which "Mit KI
 * ausfüllen" opens on "Websuche" (spec 0055, REQ-005). A photo, links or a description do not
 * finish it; a collection never is unfinished.
 */
export function isUnfinishedRecipe(
  recipe: Pick<Recipe, 'kind' | 'ingredients' | 'steps'>,
): boolean {
  return recipe.kind === 'recipe' && recipe.ingredients.length === 0 && recipe.steps.length === 0;
}

/** n in "Unfertig (n)" (REQ-002). */
export function unfinishedCount(recipes: readonly Recipe[]): number {
  return recipes.filter(isUnfinishedRecipe).length;
}

const byTitle = (a: Recipe, b: Recipe) => a.title.localeCompare(b.title, 'de');

/**
 * REQ-005: the unfinished recipe after `currentId` in `order` (the list the page was opened from,
 * spec 0034), then from the front of it; unfinished recipes outside the order follow A–Z, and
 * without an order everything is A–Z. `remaining` counts the unfinished recipes other than the
 * open one.
 */
export function nextUnfinished(
  recipes: readonly Recipe[],
  order: readonly Id[] | undefined,
  currentId: Id,
): { next: Id | undefined; remaining: number } {
  const waiting = recipes.filter((recipe) => isUnfinishedRecipe(recipe) && recipe.id !== currentId);
  const ids = new Set(waiting.map((recipe) => recipe.id));
  const ordered = [...new Set(order ?? [])];
  const inOrder = new Set(ordered);
  const outside = recipes
    .filter((recipe) => !inOrder.has(recipe.id) && (ids.has(recipe.id) || recipe.id === currentId))
    .sort(byTitle)
    .map((recipe) => recipe.id);
  const sequence = [...ordered, ...outside];
  const at = sequence.indexOf(currentId);
  const rotated = at < 0 ? sequence : [...sequence.slice(at + 1), ...sequence.slice(0, at)];
  return { next: rotated.find((id) => ids.has(id)), remaining: waiting.length };
}

/** Over the list with "Unfertig" on (REQ-003): "Noch 12 unfertig". */
export function unfinishedListLabel(count: number): string {
  return `Noch ${count} unfertig`;
}

/** On an unfinished recipe (AC-018): "Noch 11 weitere unfertig"; nothing when it is the last. */
export function unfinishedOthersLabel(remaining: number): string | undefined {
  if (remaining === 0) return undefined;
  return remaining === 1 ? 'Noch 1 weiteres unfertig' : `Noch ${remaining} weitere unfertig`;
}

/** After saving a recipe that was unfinished (AC-017, AC-020). */
export function workedOutLabel(remaining: number): string {
  return remaining === 0
    ? 'Alle Rezepte sind ausgearbeitet'
    : `Ausgearbeitet · noch ${remaining} unfertig`;
}
