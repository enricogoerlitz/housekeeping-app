import {
  dietLabel,
  type ArticleFilter,
  type ArticleSort,
  type Diet,
  type ShoppingRule,
} from '@housekeeping/core';
import type { ChoiceOption } from '@housekeeping/ui';

// Copy of the page "Artikel" and the window "Artikel bearbeiten" (spec 0007, REQ-005 to REQ-007).

export const SORT_OPTIONS: ChoiceOption<ArticleSort>[] = [
  { value: 'name', label: 'A–Z' },
  { value: 'new', label: 'Neu' },
];

const FILTER_LABELS: Record<ArticleFilter, string> = {
  all: 'Alle',
  noArea: 'Ohne Bereich',
  pantry: 'Vorrat',
  needsReview: 'Neu aus Rezepten',
  similar: 'Ähnliche Namen',
};
export const FILTERS: ArticleFilter[] = ['all', 'noArea', 'pantry', 'needsReview', 'similar'];
// "Alle" and "Vorrat" carry no number (AC-021).
const COUNTED = new Set<ArticleFilter>(['noArea', 'needsReview', 'similar']);

/** "Ohne Bereich (2)". */
export function filterChipLabel(filter: ArticleFilter, counts: Record<ArticleFilter, number>) {
  const label = FILTER_LABELS[filter];
  return COUNTED.has(filter) ? `${label} (${counts[filter]})` : label;
}

/** The empty state of a filter without articles (AC-027). */
export function emptyFilterTitle(filter: ArticleFilter): string {
  return `Keine Artikel unter „${FILTER_LABELS[filter]}“`;
}

/**
 * The filter in the address, so other pages can open "Artikel" with one set: "Ohne Bereich ›" on
 * "Bereiche" opens `/artikel?filter=ohne-bereich` (AC-051).
 */
const FILTER_PARAMS: Record<string, ArticleFilter> = {
  'ohne-bereich': 'noArea',
  vorrat: 'pantry',
  'neu-aus-rezepten': 'needsReview',
  'aehnliche-namen': 'similar',
};
export function filterFromParam(param: string | undefined): ArticleFilter {
  return (param !== undefined && FILTER_PARAMS[param]) || 'all';
}

export const DIET_OPTIONS: ChoiceOption<Diet>[] = (
  ['vegan', 'vegetarian', 'fish', 'meat', 'unknown'] as const
).map((diet) => ({ value: diet, label: dietLabel(diet) }));

/** No Standard-Einkaufsregel set yet: no chip is active. */
export type RuleChoice = ShoppingRule | 'unset';
export const RULE_OPTIONS: ChoiceOption<RuleChoice>[] = [
  { value: 'count', label: 'Anzahl' },
  { value: 'recipeAmount', label: 'Rezeptmenge' },
  { value: 'skip', label: 'nicht übernehmen' },
];

/** Second line of a row: "Konserven & Saucen · vegan"; an unknown diet is left out. */
export function articleRowDetail(areaName: string | undefined, diet: Diet): string {
  const parts = [areaName ?? 'Ohne Bereich'];
  if (diet !== 'unknown') parts.push(dietLabel(diet));
  return parts.join(' · ');
}

export const SIMILAR_PREFIX = 'ähnlich wie';
