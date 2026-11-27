import { draftLinks } from './recipe-draft';

// The one field of "Neues Rezept", "Restaurant anlegen" and "Aktivität anlegen" (spec 0062,
// REQ-002, REQ-008): under it stand the same ways; the one the text suggests is highlighted and
// taken by Return. The suggestion never starts anything by itself.

/** "Anlegen", "Websuche", "KI-Rezept". */
export type CreatePath = 'create' | 'web' | 'ai';

export const RECIPE_CREATE_PATHS: readonly CreatePath[] = ['create', 'web', 'ai'];
/** Places have no AI draft (spec 0049, non-goal). */
export const PLACE_CREATE_PATHS: readonly CreatePath[] = ['create', 'web'];

/** A recipe: from this many words on a sentence is a wish for the AI. */
const RECIPE_WISH_WORDS = 4;
/** A place: up to this many words are a name to search for. */
const PLACE_SEARCH_WORDS = 4;

function wordCount(text: string): number {
  return text.split(/\s+/).filter((part) => /[\p{L}\p{N}]/u.test(part)).length;
}

/**
 * The way the text suggests among `paths`, or undefined for blank text. Recipes: a link, a digit
 * or four words and more → the AI, else the web search. Places: a link or more than four words →
 * the form, else the web search.
 */
export function suggestedCreatePath(
  text: string,
  paths: readonly CreatePath[],
): CreatePath | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const offered = (path: CreatePath) => (paths.includes(path) ? path : 'create');
  const link = draftLinks(trimmed).length > 0;
  const words = wordCount(trimmed);
  if (paths.includes('ai')) {
    const wish = link || /\d/.test(trimmed) || words >= RECIPE_WISH_WORDS;
    return wish ? 'ai' : offered('web');
  }
  if (link || words > PLACE_SEARCH_WORDS) return 'create';
  return offered('web');
}
