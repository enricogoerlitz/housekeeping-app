import type { WebSearchKind } from './ai-contract';
import type { IngredientRow } from './recipe-editor';
import { draftLinks } from './recipe-draft';
import type { Article, Id } from './types';

// The Websuche (spec 0049) besides the cards: the status line while searching, a link pasted
// into the search field, and the ingredients of a recipe preview as the household knows them.

/** AC-005: where the search looks, while the cards are loading. */
export function searchStatusLine(kind: WebSearchKind): string {
  return kind === 'recipe'
    ? 'Suche bei Chefkoch und anderen Rezeptseiten …'
    : 'Suche bei Google Maps …';
}

/** The photo a found entry gets (REQ-010): the hit's own, three made by the AI, or none. */
export type WebPhotoChoice = 'source' | 'ai' | 'none';

/** AC-034, AC-036: the hit's photo unless the search text wished for a picture. */
export function defaultWebPhotoChoice(
  hasSourcePhoto: boolean,
  imageWish: string | undefined,
): WebPhotoChoice {
  if (imageWish?.trim()) return 'ai';
  return hasSourcePhoto ? 'source' : 'ai';
}

/** AC-035: without a usable photo of the hit, "Original" means "Foto generieren". */
export function effectiveWebPhotoChoice(
  choice: WebPhotoChoice,
  hasSourcePhoto: boolean,
): WebPhotoChoice {
  return choice === 'source' && !hasSourcePhoto ? 'ai' : choice;
}

/** AC-002: a link alone in the search field (it goes to „Eigene Angaben“); words make a search. */
export function pastedLink(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === '' || /\s/u.test(trimmed)) return undefined;
  const links = draftLinks(trimmed);
  return links.length === 1 ? links[0] : undefined;
}

export interface PreviewIngredient {
  /** "✓ 2 Möhren" or "neu: 50 g Paniermehl". */
  label: string;
  /** An article of the household; else it is created on "Speichern". */
  known: boolean;
}

/** AC-010: the ingredients of a recipe preview, already matched to the household's articles. */
export function previewIngredients(
  rows: readonly IngredientRow[],
  articlesById: Record<Id, Article>,
): PreviewIngredient[] {
  return rows.map((row) => {
    const article = row.article;
    const knownName =
      article?.kind === 'article'
        ? articlesById[article.articleId]?.name
        : article?.kind === 'hit' && article.hit.kind === 'article'
          ? article.hit.name
          : undefined;
    const name =
      knownName ??
      (article?.kind === 'hit'
        ? article.hit.name
        : article?.kind === 'new'
          ? article.name
          : row.name) ??
      '';
    const text = `${row.amountText.trim()} ${name}`.trim();
    return knownName
      ? { label: `✓ ${text}`, known: true }
      : { label: `neu: ${text}`, known: false };
  });
}
