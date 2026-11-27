// Groups of ingredients ("Béchamel", spec 0023, REQ-004, E-05): on the recipe page, the chosen
// variant, the own ingredients of a collection and the cooking mode; the edit mode and the
// Änderungsansicht split by variant too (ingredientSections, Nachklick 27.11., N-01).

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

/** Heading of the ingredients every variant has (recipe edit mode, Änderungsansicht). */
export const ALL_VARIANTS_LABEL = 'Alle Varianten';

/** A variant's name as a heading; a blank one reads „Ohne Namen“ as in the variant list. */
export function variantLabel(name: string): string {
  return name.trim() || 'Ohne Namen';
}

export interface IngredientSection<T> {
  /** Undefined for the ingredients every variant has. */
  variantId?: string;
  /** „Alle Varianten“ or the variant's name; none for a recipe without variants. */
  title?: string;
  groups: IngredientGroup<T>[];
}

/**
 * The ingredients split as the recipe page shows them (Nachklick 27.11., N-01): without variants
 * one part, split by group; with variants first „Alle Varianten“, then each variant in its order,
 * each split by group. A row of a variant that is gone counts for all. Parts without rows are left
 * out.
 */
export function ingredientSections<T extends { group?: string; variantId?: string }>(
  rows: readonly T[],
  variants: readonly { id: string; name: string }[],
): IngredientSection<T>[] {
  if (variants.length === 0) return [{ groups: groupIngredients(rows) }];
  const known = new Set(variants.map((variant) => variant.id));
  const base = rows.filter((row) => row.variantId === undefined || !known.has(row.variantId));
  const sections: IngredientSection<T>[] =
    base.length > 0 ? [{ title: ALL_VARIANTS_LABEL, groups: groupIngredients(base) }] : [];
  for (const variant of variants) {
    const own = rows.filter((row) => row.variantId === variant.id);
    if (own.length === 0) continue;
    sections.push({
      variantId: variant.id,
      title: variantLabel(variant.name),
      groups: groupIngredients(own),
    });
  }
  return sections;
}
