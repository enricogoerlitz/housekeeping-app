import {
  adoptStarterRecipes,
  listStarterRecipes,
  photoSource,
  useRecipes,
} from '@housekeeping/api';
import { Badge, Button, List, ListRow, Photo, Sheet, Text, toast } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

/** Browse the starter recipes and copy them into the household's recipe book (F3, AC-016). */
export function StarterSheet(props: { visible: boolean; onClose: () => void }) {
  const online = useOnlineOnly();
  // The starter recipes are bundled with the app and do not change while it runs.
  const [starters] = useState(listStarterRecipes);
  // Adoption is read from the recipe book itself, so the rows update after "Übernehmen".
  const recipes = useRecipes();
  const titles = new Set(recipes.map((recipe) => recipe.title));
  const open = starters.filter((starter) => !titles.has(starter.title));

  const adopt = (keys: string[]) => {
    const count = adoptStarterRecipes(keys);
    if (count > 0)
      toast.show({ message: count === 1 ? 'Rezept übernommen' : `${count} Rezepte übernommen` });
  };

  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      title="Starter-Rezepte"
      size="l"
      testID="starter-sheet"
      footer={
        <Button
          label="Alle übernehmen"
          variant="secondary"
          full
          disabled={online.disabled || open.length === 0}
          hint={online.hint}
          onPress={() => adopt(open.map((starter) => starter.key))}
          testID="starter-adopt-all"
        />
      }
    >
      <Text color="muted" style={{ marginBottom: 12 }}>
        Klassiker zum Übernehmen. Danach sind es ganz normale Rezepte in eurem Rezeptbuch.
      </Text>
      <List>
        {starters.map((starter) => {
          const adopted = titles.has(starter.title);
          return (
            <ListRow
              key={starter.key}
              testID={`starter-${starter.key}`}
              title={starter.title}
              subtitle={`${starter.totalMinutes} Min · ${starter.description}`}
              leading={<Photo source={photoSource(starter.photo)} width={52} height={52} />}
              trailing={
                adopted ? (
                  <Badge
                    label="im Rezeptbuch"
                    icon="check"
                    tone="success"
                    testID={`starter-adopted-${starter.key}`}
                  />
                ) : (
                  <Button
                    label="Übernehmen"
                    size="sm"
                    variant="ghost"
                    disabled={online.disabled}
                    hint={online.hint}
                    onPress={() => adopt([starter.key])}
                    testID={`starter-adopt-${starter.key}`}
                  />
                )
              }
            />
          );
        })}
      </List>
    </Sheet>
  );
}
