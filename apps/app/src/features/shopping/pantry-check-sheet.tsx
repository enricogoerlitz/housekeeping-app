import {
  addPlannedToList,
  pantryCheckRows,
  snapshot,
  useHousehold,
  usePlanEntries,
  useRecipesById,
  useShoppingItems,
  useToday,
  type PantryCheckRow,
  type PantryRecipe,
} from '@housekeeping/api';
import {
  addDays,
  listPickerContinueLabel,
  listPickerPreselection,
  listPickerWeek,
  startOfWeek,
  toggleDaySelection,
  type Id,
  type ISODate,
  type Recipe,
} from '@housekeeping/core';
import {
  Button,
  Checkbox,
  GroupLabel,
  Icon,
  List,
  ListRow,
  Row,
  Sheet,
  Text,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { ListPickerStep, RecipeSearch, WeekPager, type ChosenRecipe } from './list-picker';

const PICK_AT_LEAST_ONE = 'Wähle mindestens ein Gericht';

/** The recipes' default "Zusatz" for this article, e.g. "Fior di Latte"; several side by side. */
function rowNote(row: PantryCheckRow): string | undefined {
  const notes = [
    ...new Set(
      row.contributions.flatMap((contribution) => (contribution.note ? [contribution.note] : [])),
    ),
  ];
  return notes.length > 0 ? notes.join(', ') : undefined;
}

function rowKey(row: PantryCheckRow): string {
  return row.articleId ?? `text:${row.name}`;
}

export interface PantryCheckSheetProps {
  /**
   * "Auf die Einkaufsliste" (REQ-008): the week step 1 opens with; from the list the current
   * week, from the calendar the one shown. Its entries from today on are preselected (D21).
   */
  weekDates?: ISODate[];
  /**
   * The direct way from a recipe page (REQ-010) or, later, a collection (spec 0009): opens the
   * pantry check for these recipes and skips step 1.
   */
  recipes?: PantryRecipe[];
  onClose: () => void;
}

type Step = 'pick' | 'search' | 'check';

/**
 * "Auf die Einkaufsliste" in one large window with two steps: "Was soll auf die Liste?" and the
 * pantry check "Was brauchst du wirklich?" (REQ-008, REQ-009). Mount it fresh for every opening so
 * the preselection is current.
 */
export function PantryCheckSheet(props: PantryCheckSheetProps) {
  const online = useOnlineOnly();
  const today = useToday();
  const entries = usePlanEntries();
  const recipesById = useRecipesById();
  const items = useShoppingItems();
  const household = useHousehold();
  const slotOrder = [...household.mealSlots].sort((a, b) => a.sort - b.sort).map((slot) => slot.id);
  const direct = props.recipes !== undefined;
  const startWeek = startOfWeek(props.weekDates?.[0] ?? today);

  const pickerInput = (week: ISODate) => ({ entries, recipesById, items, today, week, slotOrder });

  const [step, setStep] = useState<Step>(direct ? 'check' : 'pick');
  const [week, setWeek] = useState<ISODate>(startWeek);
  const [selected, setSelected] = useState<Set<Id>>(
    () => new Set(direct ? [] : listPickerPreselection(pickerInput(startWeek))),
  );
  const [chosen, setChosen] = useState<ChosenRecipe[]>([]);
  const [rows, setRows] = useState<PantryCheckRow[]>(() =>
    direct ? pantryCheckRows([], props.recipes) : [],
  );
  const [kept, setKept] = useState<Set<string>>(() => defaultKept(rows));
  const [showPantry, setShowPantry] = useState(false);

  const shown = listPickerWeek(pickerInput(week));
  // Only entries that still exist count; one could be deleted on another device meanwhile.
  const entryIds = entries.filter((entry) => selected.has(entry.id)).map((entry) => entry.id);
  const chosenRecipes: PantryRecipe[] = chosen
    .filter((choice) => choice.selected)
    .map((choice) => ({ recipeId: choice.recipe.id, portions: choice.recipe.servings }));
  const dishes = entryIds.length + chosenRecipes.length;
  const nextHint = online.hint ?? (dishes === 0 ? PICK_AT_LEAST_ONE : undefined);

  const toggleEntry = (entryId: Id) => {
    const next = new Set(selected);
    if (next.has(entryId)) next.delete(entryId);
    else next.add(entryId);
    setSelected(next);
  };

  const chooseRecipe = (recipe: Recipe) => {
    setChosen((current) =>
      current.some((choice) => choice.recipe.id === recipe.id)
        ? current.map((choice) =>
            choice.recipe.id === recipe.id ? { ...choice, selected: true } : choice,
          )
        : [...current, { recipe, selected: true }],
    );
    setStep('pick');
  };

  const toggleChosen = (recipeId: Id) =>
    setChosen((current) =>
      current.map((choice) =>
        choice.recipe.id === recipeId ? { ...choice, selected: !choice.selected } : choice,
      ),
    );

  const next = () => {
    const found = pantryCheckRows(entryIds, chosenRecipes);
    setRows(found);
    setKept(defaultKept(found));
    setShowPantry(false);
    setStep('check');
  };

  const toggleRow = (row: PantryCheckRow) => {
    const key = rowKey(row);
    const nextKept = new Set(kept);
    if (nextKept.has(key)) nextKept.delete(key);
    else nextKept.add(key);
    setKept(nextKept);
  };

  const apply = () => {
    const restore = snapshot();
    const count = addPlannedToList(rows.filter((row) => kept.has(rowKey(row))));
    props.onClose();
    toast.show({
      message: `${count} Artikel auf der Liste`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };

  if (step === 'search') {
    return (
      <Sheet
        visible
        onClose={props.onClose}
        title="Rezept wählen"
        testID="pantry-check-sheet"
        size="l"
        footer={
          <Button
            label="Zurück"
            icon="chevron-left"
            variant="ghost"
            testID="pick-recipe-back"
            onPress={() => setStep('pick')}
          />
        }
      >
        <RecipeSearch onChoose={chooseRecipe} />
      </Sheet>
    );
  }

  if (step === 'pick') {
    return (
      <Sheet
        visible
        onClose={props.onClose}
        title="Was soll auf die Liste?"
        testID="pantry-check-sheet"
        size="l"
        header={<WeekPager week={week} onShift={(weeks) => setWeek(addDays(week, weeks * 7))} />}
        footer={
          <View style={{ gap: 8 }}>
            {nextHint ? (
              <Text variant="small" color="muted" align="center" testID="pc-next-hint">
                {nextHint}
              </Text>
            ) : null}
            <Row gap={10}>
              <Button
                label="Rezept wählen …"
                variant="ghost"
                testID="pick-choose-recipe"
                onPress={() => setStep('search')}
              />
              <View style={{ flex: 1 }}>
                <Button
                  label={listPickerContinueLabel(dishes)}
                  icon="arrow-right"
                  full
                  disabled={online.disabled || dishes === 0}
                  hint={nextHint}
                  testID="pc-next"
                  onPress={next}
                />
              </View>
            </Row>
          </View>
        }
      >
        <ListPickerStep
          week={shown}
          selected={selected}
          onToggleEntry={toggleEntry}
          onToggleDay={(ids) => setSelected(toggleDaySelection(selected, ids))}
          chosen={chosen}
          onToggleChosen={toggleChosen}
        />
      </Sheet>
    );
  }

  const needed = rows.filter((row) => !row.isPantry);
  const pantry = rows.filter((row) => row.isPantry);
  const renderRow = (row: PantryCheckRow) => {
    const isKept = kept.has(rowKey(row));
    const usable = row.articleId !== undefined;
    return (
      <ListRow
        key={rowKey(row)}
        title={row.name}
        note={rowNote(row)}
        // Selected reads as normal text with a tick; deselected ("haben wir") is faded and struck
        // through (REQ-009).
        strike={!isKept}
        subtitle={usable ? row.sources.join(' · ') : 'Nicht im Katalog – bitte von Hand eintragen'}
        disabled={!usable}
        onPress={() => toggleRow(row)}
        leading={
          <Checkbox
            checked={isKept}
            label={row.name}
            disabled={!usable}
            onChange={() => toggleRow(row)}
            testID={`pc-row-${row.articleId ?? row.name}-check`}
          />
        }
        trailing={
          row.amount ? (
            <Text variant="body" color={isKept ? 'text' : 'muted'} strike={!isKept}>
              {row.amount}
            </Text>
          ) : undefined
        }
        accessibilityLabel={`${row.name}${row.amount ? ` ${row.amount}` : ''}, ${
          isKept ? 'kommt auf die Liste' : 'haben wir'
        }`}
        testID={`pc-row-${row.articleId ?? row.name}`}
      />
    );
  };

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title="Was brauchst du wirklich?"
      testID="pantry-check-sheet"
      size="l"
      footer={
        <Row gap={10}>
          {direct ? null : (
            <Button
              label="Zurück"
              icon="chevron-left"
              variant="ghost"
              testID="pc-back"
              onPress={() => setStep('pick')}
            />
          )}
          <View style={{ flex: 1 }}>
            <Button
              label={`${kept.size} übernehmen`}
              icon="check"
              full
              disabled={online.disabled || kept.size === 0}
              hint={online.hint}
              testID="pc-apply"
              onPress={apply}
            />
          </View>
        </Row>
      }
    >
      {rows.length === 0 ? (
        <Text color="muted" testID="pc-nothing">
          Für diese Gerichte ist nichts einzukaufen.
        </Text>
      ) : (
        <View>
          {needed.length > 0 ? (
            <>
              <GroupLabel testID="pc-zone-needed">Kommt auf die Liste</GroupLabel>
              <List>{needed.map(renderRow)}</List>
            </>
          ) : null}
          {pantry.length > 0 ? (
            <>
              <Pressable
                testID="pc-pantry-toggle"
                accessibilityRole="button"
                accessibilityState={{ expanded: showPantry }}
                accessibilityLabel={`Vorrat & Gewürze (${pantry.length})`}
                onPress={() => setShowPantry(!showPantry)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                  marginTop: 8,
                }}
              >
                <Icon
                  name={showPantry ? 'chevron-down' : 'chevron-right'}
                  size={18}
                  color="muted"
                />
                <Text variant="groupLabel" heading>
                  {`Vorrat & Gewürze (${pantry.length})`}
                </Text>
              </Pressable>
              {showPantry ? (
                <>
                  <Text variant="small" color="muted" style={{ marginBottom: 6 }}>
                    Hast du meist da. Antippen, wenn es doch mit soll.
                  </Text>
                  <List>{pantry.map(renderRow)}</List>
                </>
              ) : null}
            </>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

/** What starts selected in the pantry check: everything except "Vorrat" and unknown articles. */
function defaultKept(rows: PantryCheckRow[]): Set<string> {
  return new Set(rows.filter((row) => !row.isPantry && row.articleId).map(rowKey));
}
