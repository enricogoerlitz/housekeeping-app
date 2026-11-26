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

const KIND_WORDS: Record<WebSearchKind, { the: string; for: string }> = {
  recipe: { the: 'Das Gericht', for: 'für das Gericht' },
  restaurant: { the: 'Das Restaurant', for: 'für das Restaurant' },
  activity: { the: 'Die Aktivität', for: 'für die Aktivität' },
};
/** The prompt field of ai-image (spec 0040) takes at most this many characters. */
const IMAGE_PROMPT_MAX = 1000;

/**
 * What the photo is made from (AC-026, AC-030): the person's image wish with what it is for, or
 * without a wish the title and kind alone. The image function turns it into its own prompts; this
 * stays the raw wish plus context (spec 0052 changes ai-image, this adapter keeps the call small).
 */
export function imageWishPrompt(
  wish: string | undefined,
  context: { title: string; kind: WebSearchKind },
): string {
  const words = KIND_WORDS[context.kind];
  const text = wish?.trim()
    ? `${wish.trim()} – ${words.for} „${context.title}“`
    : `${words.the} „${context.title}“`;
  return text.slice(0, IMAGE_PROMPT_MAX);
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
