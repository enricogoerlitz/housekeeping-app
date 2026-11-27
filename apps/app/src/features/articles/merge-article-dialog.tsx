import { mergeArticles, useArticles, useRecipes, useShoppingItems } from '@housekeeping/api';
import { mergeArticlesPreview, type Id } from '@housekeeping/core';
import { Sheet, Stack, Text, toast } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';

/**
 * "Milchkokos in Kokosmilch zusammenführen?" (AC-036): a small window with what moves; there is no
 * "Rückgängig" afterwards (open question 3).
 */
export function MergeArticleDialog(props: {
  sourceId: Id;
  targetId: Id;
  onCancel: () => void;
  onMerged: (targetId: Id) => void;
}) {
  const articles = useArticles();
  const recipes = useRecipes();
  const items = useShoppingItems();
  const online = useOnlineOnly();
  const [error, setError] = useState<string | undefined>();
  const source = articles.find((article) => article.id === props.sourceId);
  const target = articles.find((article) => article.id === props.targetId);
  if (!source || !target) return null;

  const preview = mergeArticlesPreview(source, target, recipes, items);
  const merge = () => {
    try {
      mergeArticles(source.id, target.id);
    } catch (caught) {
      setError(errorMessage(caught, FAILED_MESSAGE));
      return;
    }
    props.onMerged(target.id);
    toast.show({ message: `„${source.name}“ ist jetzt Teil von „${target.name}“` });
  };

  return (
    <Sheet
      visible
      size="s"
      title={preview.title}
      onClose={props.onCancel}
      testID="merge-dialog"
      // "Abbrechen" · question · named button, like every window that decides (spec 0054).
      actions={{
        cancel: { label: 'Abbrechen', onPress: props.onCancel, testID: 'merge-dialog-cancel' },
        primary: {
          label: 'Zusammenführen',
          disabled: online.disabled || preview.tooManySynonyms,
          hint: online.hint ?? preview.tooManySynonymsMessage,
          onPress: merge,
          testID: 'merge-dialog-confirm',
        },
      }}
    >
      <Stack gap={10}>
        <Text testID="merge-dialog-text">{preview.message}</Text>
        {preview.tooManySynonymsMessage || error || online.hint ? (
          <Text variant="small" color="warn" testID="merge-dialog-error">
            {preview.tooManySynonymsMessage ?? error ?? online.hint}
          </Text>
        ) : null}
      </Stack>
    </Sheet>
  );
}
