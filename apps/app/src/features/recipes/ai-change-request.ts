import type { Id } from '@housekeeping/core';
import { useSyncExternalStore } from 'react';

// Spec 0067, step C: a change of a recipe asked for in the agent's chat ("vegetarische
// Variante"). Like the hand-over of "Ausarbeiten" (spec 0061, Entscheidung 7) the wish waits in
// memory for the recipe's page, which takes it once and runs "Mit KI ändern" with it. Once its
// Änderungsansicht is taken over, the asking card (its token) learns it and shows the result.

const requested = new Map<Id, { wish: string; token: string }>();
const applied = new Set<string>();
const listeners = new Set<() => void>();

export function requestAiChange(recipeId: Id, wish: string, token: string): void {
  requested.set(recipeId, { wish, token });
}

/** The wish for `recipeId` without taking it (for the first render of the page). */
export function peekAiChange(recipeId: Id): string | undefined {
  return requested.get(recipeId)?.wish;
}

/** The wish for `recipeId` and the card that asked, once. */
export function takeAiChange(recipeId: Id): { wish: string; token: string } | undefined {
  const asked = requested.get(recipeId);
  requested.delete(recipeId);
  return asked;
}

/** The change the card `token` asked for is saved. */
export function markAiChangeApplied(token: string): void {
  applied.add(token);
  for (const listener of listeners) listener();
}

/** Whether the change the card `token` asked for was taken over on the recipe's page. */
export function useAiChangeApplied(token: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => applied.has(token),
  );
}
