import { IconButton, Row, Stack, Text, TextField } from '@housekeeping/ui';

/** Servings a new recipe starts with (createRecipe's default). */
export const DEFAULT_SERVINGS = 2;

/**
 * The minimum of a new recipe: its title (required, "Titel fehlt") and, where asked for, the
 * servings. Used by "Neues Rezept" and by the plan's add sheet (spec 0004, AC-022).
 */
export function NewRecipeFields(props: {
  title: string;
  onChangeTitle: (title: string) => void;
  error?: string;
  onSubmit: () => void;
  autoFocus?: boolean;
  servings?: { value: number; onChange: (servings: number) => void };
}) {
  const { servings } = props;
  return (
    <Stack gap={16}>
      <TextField
        label="Titel"
        placeholder="z. B. Linsen-Dal"
        value={props.title}
        onChangeText={props.onChangeTitle}
        onSubmitEditing={props.onSubmit}
        returnKeyType="done"
        autoFocus={props.autoFocus}
        error={props.error}
        testID="new-recipe-title"
      />
      {servings ? (
        <Stack gap={6}>
          <Text variant="smallStrong">Portionen</Text>
          <Row gap={4}>
            <IconButton
              icon="minus"
              label="Eine Portion weniger"
              disabled={servings.value <= 1}
              onPress={() => servings.onChange(Math.max(1, servings.value - 1))}
              testID="new-recipe-servings-minus"
            />
            <Text variant="bodyStrong" testID="new-recipe-servings">
              {servings.value}
            </Text>
            <IconButton
              icon="plus"
              label="Eine Portion mehr"
              onPress={() => servings.onChange(servings.value + 1)}
              testID="new-recipe-servings-plus"
            />
          </Row>
        </Stack>
      ) : null}
    </Stack>
  );
}
