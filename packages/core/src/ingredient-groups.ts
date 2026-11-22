// Groups of ingredients ("Béchamel", spec 0023, REQ-004, E-05): on the recipe page, the chosen
// variant, the own ingredients of a collection and the cooking mode. The open section "Zutaten"
// keeps its flat list.

export const MAX_GROUP_LENGTH = 60;

export interface IngredientGroup<T> {
  /** Undefined for the ingredients without group, shown first without heading. */
  group?: string;
  items: T[];
}

/** Case and edge spaces do not count: "Béchamel" and "béchamel " are one group. */
function groupKey(group: string | undefined): string {
  return (group ?? '').trim().toLocaleLowerCase('de');
}

/**
 * The ingredients without group first, then each group in the order of its first ingredient,
 * named as written there. Parts without ingredients are left out.
 */
export function groupIngredients<T extends { group?: string }>(
  ingredients: readonly T[],
): IngredientGroup<T>[] {
  const ungrouped: T[] = [];
  const groups = new Map<string, IngredientGroup<T>>();
  for (const ingredient of ingredients) {
    const key = groupKey(ingredient.group);
    if (key === '') {
      ungrouped.push(ingredient);
      continue;
    }
    const existing = groups.get(key);
    if (existing) existing.items.push(ingredient);
    else groups.set(key, { group: (ingredient.group ?? '').trim(), items: [ingredient] });
  }
  const parts = [...groups.values()];
  return ungrouped.length > 0 ? [{ items: ungrouped }, ...parts] : parts;
}

/** The recipe's groups as suggestions in "Zutat bearbeiten" (AC-006). */
export function groupSuggestions(ingredients: readonly { group?: string }[]): string[] {
  return groupIngredients(ingredients).flatMap((part) =>
    part.group === undefined ? [] : [part.group],
  );
}

/** "Höchstens 60 Zeichen" for a longer group (recipes_ingredients_group_valid). */
export function groupProblem(group: string): string | undefined {
  return Array.from(group.trim()).length > MAX_GROUP_LENGTH
    ? `Höchstens ${MAX_GROUP_LENGTH} Zeichen`
    : undefined;
}
