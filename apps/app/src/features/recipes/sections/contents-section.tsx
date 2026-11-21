import { collectionContentLabel, type CollectionContent, type Id } from '@housekeeping/core';
import { List, ListRow, Section, Text } from '@housekeeping/ui';

import { RecipeCover } from '../recipe-cover';

/**
 * "Enthält" on the page of a collection (spec 0009, REQ-003, E13): the contained recipes in their
 * order, "Kartoffelsalat · 6 Port." or with a chosen variant "Grillgemüse · vegan · 8 Port."
 * (AC-016); a tap opens the recipe's page (AC-004). Read only here: the pen with order, portions,
 * variant and removing, and "+ Rezept hinzufügen" with the window "Rezepte zu …" come with Task 8.
 */
export function ContentsSection(props: {
  contents: readonly CollectionContent[];
  onOpen: (recipeId: Id) => void;
}) {
  return (
    <Section title="Enthält" testID="collection-contents">
      {props.contents.length === 0 ? (
        <Text color="muted" testID="collection-contents-empty">
          Noch keine Rezepte.
        </Text>
      ) : (
        <List>
          {props.contents.map((content) => (
            <ListRow
              key={content.row.id}
              testID={`collection-content-${content.recipe.id}`}
              title={collectionContentLabel(content)}
              leading={<RecipeCover recipe={content.recipe} width={44} height={44} />}
              onPress={() => props.onOpen(content.recipe.id)}
            />
          ))}
        </List>
      )}
    </Section>
  );
}
