import {
  addIngredientsConfirmed,
  starterCatalogEntries,
  useArticles,
  WRITE_REJECTED_MESSAGE,
  type IngredientInput,
} from '@housekeeping/api';
import {
  chooseDraftArticle,
  ingredientDrafts,
  returnRejectedDrafts,
  splitIngredientDrafts,
  type Article,
  type DraftArticle,
  type Id,
  type IngredientDraft,
  type ReadyIngredientDraft,
} from '@housekeeping/core';
import { toast } from '@housekeeping/ui';
import { useEffect, useRef, useState } from 'react';

// Draft lines of "Mehrere einfügen" (REQ-002) live only in the editor of one recipe: on the recipe
// page while it is open. "Neues Rezept" hands its pasted lines over to the page of the new recipe,
// which saves what has an article and keeps the rest orange (AC-010).

const handedOver = new Map<Id, IngredientDraft[]>();
let draftSeq = 0;
const newDraftKey = () => `draft-${++draftSeq}`;

/** The lines of a pasted block, sorted sure / "Meinst du …?" / new (classifyIngredientLines). */
export function draftsFromText(text: string, articles: readonly Article[]): IngredientDraft[] {
  return ingredientDrafts(text, articles, starterCatalogEntries, newDraftKey);
}

/** "Neues Rezept": the pasted lines for the recipe page, which saves them as it opens. */
export function handOverIngredientDrafts(recipeId: Id, drafts: IngredientDraft[]): void {
  if (drafts.length > 0) handedOver.set(recipeId, drafts);
}

function inputOf(draft: ReadyIngredientDraft): IngredientInput {
  const input: IngredientInput = {
    article:
      draft.article.kind === 'hit' ? { hit: draft.article.hit } : { newName: draft.article.name },
  };
  if (draft.line.amount) input.amount = draft.line.amount;
  return input;
}

export function insertedLabel(count: number): string {
  return count === 1 ? '1 Zutat eingefügt' : `${count} Zutaten eingefügt`;
}

export interface IngredientDraftsState {
  drafts: IngredientDraft[];
  /** The window "Zutaten einfügen" is open. */
  visible: boolean;
  /** Shown above the lines: a refused save, or a line that failed locally. */
  error?: string;
  open: () => void;
  /** Leaves the editor: lines without article are not saved (AC-010). */
  close: () => void;
  /** Turns a pasted block into lines; false when there was none. */
  paste: (text: string) => boolean;
  choose: (key: string, article: DraftArticle) => void;
  /** Saves every line with an article; the others stay orange (AC-010). */
  save: () => void;
}

/**
 * The editor's draft lines for one recipe. Saving sends the ready lines in one change; when the
 * server refuses it, they come back orange and the window opens again ("Hat nicht geklappt").
 */
export function useIngredientDrafts(recipeId: Id): IngredientDraftsState {
  const articles = useArticles();
  // Read here, removed when saved: React may run this initialiser twice in development.
  const [initial] = useState(() => handedOver.get(recipeId));
  const [drafts, setDrafts] = useState<IngredientDraft[]>(initial ?? []);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const save = (current: IngredientDraft[] = drafts) => {
    const { ready, open } = splitIngredientDrafts(current, articles);
    setError(undefined);
    setDrafts(open);
    setVisible(open.length > 0);
    if (ready.length === 0) return;
    toast.show({ message: insertedLabel(ready.length) });
    addIngredientsConfirmed(recipeId, ready.map(inputOf)).catch(() => {
      setDrafts((now) => returnRejectedDrafts(now, ready));
      setError(WRITE_REJECTED_MESSAGE);
      setVisible(true);
    });
  };

  // Lines handed over by "Neues Rezept" are saved once, as the page opens.
  const pending = useRef(initial);
  useEffect(() => {
    const lines = pending.current;
    pending.current = undefined;
    handedOver.delete(recipeId);
    if (lines) save(lines);
    // Runs once for the lines handed over at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    drafts,
    visible,
    error,
    open: () => setVisible(true),
    close: () => {
      setVisible(false);
      setDrafts([]);
      setError(undefined);
    },
    paste: (text) => {
      const lines = draftsFromText(text, articles);
      if (lines.length === 0) return false;
      setError(undefined);
      setDrafts(lines);
      return true;
    },
    choose: (key, article) => setDrafts((now) => chooseDraftArticle(now, key, article)),
    save: () => save(),
  };
}
