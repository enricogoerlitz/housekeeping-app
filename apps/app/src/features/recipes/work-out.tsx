import { useRecipes } from '@housekeeping/api';
import {
  isUnfinishedRecipe,
  nextUnfinished,
  unfinishedOthersLabel,
  workedOutLabel,
  type Id,
  type Recipe,
} from '@housekeeping/core';
import { Button, Icon, Row, Stack, Surface, Text } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';
import { browseOrder } from '@/lib/browse-order';
import { features } from '@/lib/features';

import { useOpenRecipe } from './navigation';
import type { PageEditor } from './sections/use-page-editor';

// Spec 0061: working out the recipes that are only a title, one after the other. "Ausarbeiten"
// over the list and "Weiter zum nächsten" on the page leave a request for the recipe in memory
// (like the hand-overs of spec 0018 and 0040); its page takes it once and opens the edit mode with
// "Mit KI ausfüllen" searching the title (Entscheidung 7).

const requested = new Set<Id>();
/**
 * Spec 0067, decision 36: the recipes chosen on a card of the agent; "Weiter zum nächsten" goes
 * through them only and stops after the last one (a list's order goes on A–Z, spec 0061).
 */
let chosen: readonly Id[] | undefined;

/** Takes the request for `recipeId`; true once after "Ausarbeiten" or "Weiter zum nächsten". */
function takeWorkOut(recipeId: Id): boolean {
  return requested.delete(recipeId);
}

/**
 * Opens a recipe to work it out (REQ-003, REQ-005): online in the edit mode with the AI window,
 * offline only to read (AC-011, AC-024). `push` opens it over the list with the list's order;
 * `replace` takes the place of the page shown, so "‹ Essen" still leads to the list.
 */
export function useWorkOut(): (
  recipeId: Id,
  how: { order: readonly Id[] } | { chosen: readonly Id[] } | 'replace',
) => void {
  const online = useOnlineOnly();
  const openRecipe = useOpenRecipe();
  const router = useRouter();
  return (recipeId, how) => {
    if (!online.disabled) requested.add(recipeId);
    if (how === 'replace') {
      router.replace({ pathname: '/rezept/[id]', params: { id: recipeId } });
      return;
    }
    chosen = 'chosen' in how ? [...how.chosen] : undefined;
    openRecipe(recipeId, 'order' in how ? how.order : undefined);
  };
}

/**
 * The card at the top of a recipe's page (REQ-004, REQ-005): on an unfinished recipe "Noch nicht
 * ausgearbeitet" with "Mit KI ausarbeiten" and "Weiter zum nächsten"; after saving one that was
 * unfinished when its page opened (`openedUnfinished`, kept by the page: the card remounts when
 * the edit mode changes the frame), "Ausgearbeitet · noch 11 unfertig" (Entscheidung 6), nothing
 * when it was the last (AC-020). Nothing while editing; beside the list without "Weiter zum
 * nächsten" (AC-023).
 */
export function UnfinishedCard(props: {
  recipe: Recipe;
  editor: PageEditor;
  openedUnfinished: boolean;
  quick?: boolean;
}) {
  const { recipe, editor, openedUnfinished } = props;
  const online = useOnlineOnly();
  const recipes = useRecipes();
  const workOut = useWorkOut();
  const unfinished = isUnfinishedRecipe(recipe);
  const start = useEffectEvent(() => {
    if (!takeWorkOut(recipe.id) || online.disabled || !unfinished || editor.draft) return;
    editor.start(features.aiRecipes ? { kind: 'ai' } : undefined);
  });
  useEffect(() => start(), []);

  if (editor.draft || editor.unsaved || recipe.kind !== 'recipe') return null;
  if (!unfinished && (!openedUnfinished || props.quick)) return null;
  const fromAgent = chosen?.includes(recipe.id) === true;
  const { next, remaining } = fromAgent
    ? nextUnfinished(recipes, chosen, recipe.id, { onlyOrder: true })
    : nextUnfinished(recipes, browseOrder('recipes'), recipe.id);
  const onNext = next && !props.quick ? () => workOut(next, 'replace') : undefined;
  const nextButton = (primary: boolean) =>
    onNext ? (
      <Button
        label="Weiter zum nächsten"
        icon="arrow-right"
        variant={primary ? 'primary' : 'secondary'}
        size="sm"
        onPress={onNext}
        testID="recipe-unfinished-next"
      />
    ) : null;

  if (!unfinished) {
    // AC-020 (changed 27.11.): the last one worked out, the card simply goes away.
    const worked = workedOutLabel(remaining);
    if (worked === undefined) return null;
    return (
      <Surface testID="recipe-worked-out">
        <Row gap={10} wrap>
          <Icon name="circle-check" size={18} color="success" />
          <Text
            variant="bodyStrong"
            style={{ flexGrow: 1, flexShrink: 1 }}
            testID="recipe-worked-out-text"
          >
            {worked}
          </Text>
          {nextButton(true)}
        </Row>
      </Surface>
    );
  }
  if (!features.aiRecipes) return null;
  const others = unfinishedOthersLabel(remaining);
  return (
    <Surface testID="recipe-unfinished">
      <Stack gap={10}>
        <Row gap={8}>
          <Icon name="sparkles" size={18} color="accent" />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            Noch nicht ausgearbeitet
          </Text>
        </Row>
        <Text variant="small" color="muted">
          {`Die KI sucht „${recipe.title}“ im Web und füllt Zutaten und Schritte aus. Du prüfst und speicherst.`}
        </Text>
        <Row gap={10} wrap>
          <Button
            label="Mit KI ausarbeiten"
            icon="sparkles"
            size="sm"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => editor.start({ kind: 'ai' })}
            testID="recipe-unfinished-ai"
          />
          {nextButton(false)}
          {others && onNext ? (
            <Text variant="small" color="muted" testID="recipe-unfinished-others">
              {others}
            </Text>
          ) : null}
        </Row>
      </Stack>
    </Surface>
  );
}
