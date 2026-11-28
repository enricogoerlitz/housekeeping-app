import type { Id } from '@housekeeping/core';

// Spec 0067, step C: a change of a recipe asked for in the agent's chat ("vegetarische
// Variante"). Like the hand-over of "Ausarbeiten" (spec 0061, Entscheidung 7) the wish waits in
// memory for the recipe's page, which takes it once and runs "Mit KI ändern" with it.

const requested = new Map<Id, string>();

export function requestAiChange(recipeId: Id, wish: string): void {
  requested.set(recipeId, wish);
}

/** The wish for `recipeId` without taking it (for the first render of the page). */
export function peekAiChange(recipeId: Id): string | undefined {
  return requested.get(recipeId);
}

/** The wish for `recipeId`, once. */
export function takeAiChange(recipeId: Id): string | undefined {
  const wish = requested.get(recipeId);
  requested.delete(recipeId);
  return wish;
}
