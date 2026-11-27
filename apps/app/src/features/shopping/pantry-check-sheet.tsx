import {
  addPlannedToList,
  pantryCheckRows,
  pantryRecipeFor,
  snapshot,
  useHousehold,
  usePlanEntries,
  useArticlesById,
  useRecipeBook,
  useRecurringItems,
  useShoppingItems,
  useToday,
  withPantryAmount,
  type PantryCheckRow,
  type PantryRecipe,
} from '@housekeeping/api';
import {
  AMOUNT_NOT_RECOGNIZED,
  listPickerContinueLabel,
  listPickerPage,
  listPickerPreselection,
  listPickerStart,
  parseItemAmount,
  recurringPickerRows,
  shiftListPickerStart,
  toggleDaySelection,
  type Id,
  type ISODate,
  type Recipe,
  type RecurringItem,
  type RecurringPickerRow,
} from '@housekeeping/core';
import {
  Button,
  CheckboxMark,
  GroupLabel,
  Icon,
  IconButton,
  List,
  ListRow,
  Sheet,
  Text,
  TextField,
  toast,
  expandableA11y,
} from '@housekeeping/ui';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { ListPickerStep, PagePager, RecipeSearch, type ChosenRecipe } from './list-picker';

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
  return row.articleId;
}

/**
 * The amount of a pantry-check row (spec 0025, REQ-007): "− n× +" for a count (− stops at 1×,
 * deselect instead of 0), else a tap on the amount opens a field; "viel" keeps the old amount
 * and says so (AC-029).
 */
function RowAmount(props: {
  row: PantryCheckRow;
  kept: boolean;
  onChange: (row: PantryCheckRow) => void;
}) {
  const { row } = props;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(row.amount);
  const [error, setError] = useState<string | undefined>();
  const testID = `pc-row-${row.articleId}`;

  if (row.count !== undefined) {
    const count = row.count;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton
          icon="minus"
          size={44}
          label={`${row.name} weniger`}
          disabled={count <= 1}
          onPress={() => props.onChange(withPantryAmount(row, { count: count - 1 }))}
          testID={`${testID}-minus`}
        />
        <Text
          variant="bodyStrong"
          color={props.kept ? 'text' : 'muted'}
          style={{ minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'] }}
          testID={`${testID}-count`}
        >
          {`${count}×`}
        </Text>
        <IconButton
          icon="plus"
          size={44}
          label={`${row.name} mehr`}
          disabled={count >= 99}
          onPress={() => props.onChange(withPantryAmount(row, { count: count + 1 }))}
          testID={`${testID}-plus`}
        />
      </View>
    );
  }

  if (!editing) {
    return (
      <Button
        label={row.amount || 'Menge'}
        variant="link"
        size="sm"
        accessibilityLabel={`Menge von ${row.name}: ${row.amount || 'keine'}. Ändern`}
        onPress={() => {
          setText(row.amount);
          setError(undefined);
          setEditing(true);
        }}
        testID={`${testID}-amount`}
      />
    );
  }

  const save = () => {
    const amount = parseItemAmount(text);
    if (amount === undefined || (amount.count === undefined && amount.qty === undefined)) {
      setError(AMOUNT_NOT_RECOGNIZED);
      return;
    }
    props.onChange(withPantryAmount(row, amount));
    setEditing(false);
  };
  return (
    <View style={{ width: 140 }}>
      <TextField
        accessibilityLabel={`Menge von ${row.name}`}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setError(undefined);
        }}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        onBlur={save}
        error={error}
        testID={`${testID}-amount-input`}
      />
    </View>
  );
}

export interface PantryCheckSheetProps {
  /**
   * "Auf die Einkaufsliste" (REQ-008): the week step 1 opens with; from the list the current
   * week, from the calendar the one shown. Its entries from today on are preselected (D21).
   */
  weekDates?: ISODate[];
  /**
   * The direct way from a recipe page (REQ-010) or the page of a collection with its portions
   * (spec 0009, AC-025): opens the pantry check for these recipes and skips step 1.
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
  const book = useRecipeBook();
  const items = useShoppingItems();
  const household = useHousehold();
  const recurringItems = useRecurringItems();
  const articlesById = useArticlesById();
  const slotOrder = household.mealSlots.map((slot) => slot.id);
  const direct = props.recipes !== undefined;
  // Seven days from today; from the calendar from the Monday of the week shown (Decision 2).
  const firstStart = listPickerStart(today, props.weekDates?.[0]);

  const pickerInput = (start: ISODate) => ({ entries, ...book, items, today, start, slotOrder });

  const [step, setStep] = useState<Step>(direct ? 'check' : 'pick');
  const [start, setStart] = useState<ISODate>(firstStart);
  const [selected, setSelected] = useState<Set<Id>>(
    () => new Set(direct ? [] : listPickerPreselection(pickerInput(firstStart))),
  );
  const [chosen, setChosen] = useState<ChosenRecipe[]>([]);
  // Spec 0060, REQ-005: chosen Dauerposten with the day they were shown for; none preselected.
  const [recurringChosen, setRecurringChosen] = useState<
    ReadonlyMap<Id, { item: RecurringItem; on: ISODate }>
  >(new Map());
  const [rows, setRows] = useState<PantryCheckRow[]>(() =>
    direct ? pantryCheckRows([], props.recipes) : [],
  );
  // "Für N Personen" (spec 0037, REQ-007): one recipe or collection from its page, preset with
  // the portions it was opened with; the amounts follow at once.
  const single = props.recipes?.length === 1 ? props.recipes[0] : undefined;
  const [people, setPeople] = useState(single?.portions ?? 1);
  const changePeople = (value: number) => {
    if (!single) return;
    const next = Math.max(1, value);
    setPeople(next);
    setRows(pantryCheckRows([], [pantryRecipeFor(single, next)]));
  };
  const [kept, setKept] = useState<Set<string>>(() => defaultKept(rows));
  // "Vorrat & Gewürze" starts open, its rows still deselected (spec 0025, AC-026).
  const [showPantry, setShowPantry] = useState(true);

  const shown = listPickerPage(pickerInput(start));
  // Only entries that still exist count; one could be deleted on another device meanwhile.
  const entryIds = entries.filter((entry) => selected.has(entry.id)).map((entry) => entry.id);
  const chosenRecipes: PantryRecipe[] = chosen
    .filter((choice) => choice.selected)
    .map((choice) => ({ recipeId: choice.recipe.id, portions: choice.recipe.servings }));
  const dishes = entryIds.length + chosenRecipes.length;
  const recurringRows = recurringPickerRows({ recurringItems, articlesById, items, start });
  // Only Dauerposten that still exist and are not open on the list meanwhile.
  const pickedRecurring = [...recurringChosen.values()].filter(
    ({ item }) =>
      recurringItems.some((candidate) => candidate.id === item.id) &&
      !recurringRows.some((row) => row.item.id === item.id && row.onList),
  );
  const nothingChosen = dishes === 0 && pickedRecurring.length === 0;
  const nextHint = online.hint ?? (nothingChosen ? PICK_AT_LEAST_ONE : undefined);
  const toggleRecurring = (row: RecurringPickerRow) =>
    setRecurringChosen((current) => {
      const next = new Map(current);
      if (next.has(row.item.id)) next.delete(row.item.id);
      else next.set(row.item.id, { item: row.item, on: row.on });
      return next;
    });

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
    const found = pantryCheckRows(entryIds, chosenRecipes, pickedRecurring);
    setRows(found);
    setKept(defaultKept(found));
    setShowPantry(true);
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
        header={
          <PagePager
            page={shown}
            onShift={(direction) => setStart(shiftListPickerStart(start, today, direction))}
          />
        }
        footer={
          <View style={{ gap: 8 }}>
            {nextHint ? (
              <Text variant="small" color="muted" align="center" testID="pc-next-hint">
                {nextHint}
              </Text>
            ) : null}
            <Button
              label="Rezept wählen …"
              variant="ghost"
              testID="pick-choose-recipe"
              onPress={() => setStep('search')}
            />
          </View>
        }
        actions={{
          primary: {
            label: listPickerContinueLabel(dishes, pickedRecurring.length),
            icon: 'arrow-right',
            disabled: online.disabled || nothingChosen,
            hint: nextHint,
            testID: 'pc-next',
            onPress: next,
          },
        }}
      >
        <ListPickerStep
          page={shown}
          selected={selected}
          onToggleEntry={toggleEntry}
          onToggleDay={(ids) => setSelected(toggleDaySelection(selected, ids))}
          chosen={chosen}
          onToggleChosen={toggleChosen}
          recurring={recurringRows}
          selectedRecurring={new Set(recurringChosen.keys())}
          onToggleRecurring={toggleRecurring}
        />
      </Sheet>
    );
  }

  const needed = rows.filter((row) => !row.isPantry);
  const pantry = rows.filter((row) => row.isPantry);
  const renderRow = (row: PantryCheckRow) => {
    const isKept = kept.has(rowKey(row));
    return (
      <ListRow
        key={rowKey(row)}
        title={row.name}
        note={rowNote(row)}
        // Selected reads as normal text with a tick; deselected ("haben wir") is faded and struck
        // through (REQ-009).
        strike={!isKept}
        // A pack ("1×") says what the recipes need, so "Für N Personen" shows (spec 0037, AC-020).
        subtitle={[
          row.recipeAmount
            ? `${row.recipeAmount} für ${row.sources.join(' · ')}`
            : row.sources.join(' · '),
          row.onList ? `schon auf der Liste: ${row.onList}` : '',
        ]
          .filter(Boolean)
          .join(' · ')}
        // The row is the checkbox; its amount buttons sit beside it (spec 0031, REQ-028).
        checked={isKept}
        onPress={() => toggleRow(row)}
        leading={<CheckboxMark checked={isKept} />}
        controls={
          <RowAmount
            row={row}
            kept={isKept}
            onChange={(changed) =>
              setRows((current) =>
                current.map((candidate) =>
                  rowKey(candidate) === rowKey(changed) ? changed : candidate,
                ),
              )
            }
          />
        }
        accessibilityLabel={`${row.name}${row.amount ? ` ${row.amount}` : ''}, ${
          isKept ? 'kommt auf die Liste' : 'haben wir'
        }`}
        testID={`pc-row-${row.articleId}`}
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
      actions={{
        primary: {
          label: `${kept.size} übernehmen`,
          icon: 'check',
          disabled: online.disabled || kept.size === 0,
          hint: online.hint,
          testID: 'pc-apply',
          onPress: apply,
        },
        cancel: direct
          ? undefined
          : {
              label: 'Zurück',
              icon: 'chevron-left',
              testID: 'pc-back',
              onPress: () => setStep('pick'),
            },
      }}
    >
      {single ? <PeopleStepper value={people} onChange={changePeople} /> : null}
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
                {...expandableA11y(`Vorrat & Gewürze (${pantry.length})`, showPantry, Platform.OS, {
                  expanded: 'aufgeklappt',
                  collapsed: 'eingeklappt',
                })}
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

/** "Für 4 Personen" with − and + at the top of the pantry check (spec 0037, REQ-007). */
function PeopleStepper(props: { value: number; onChange: (value: number) => void }) {
  const { value } = props;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}
      testID="pc-people"
    >
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        {value === 1 ? 'Für 1 Person' : `Für ${value} Personen`}
      </Text>
      <IconButton
        icon="minus"
        size={44}
        variant="soft"
        label="Eine Person weniger"
        disabled={value <= 1}
        onPress={() => props.onChange(value - 1)}
        testID="pc-people-minus"
      />
      <Text
        variant="bodyStrong"
        style={{ minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] }}
        testID="pc-people-value"
      >
        {value}
      </Text>
      <IconButton
        icon="plus"
        size={44}
        variant="soft"
        label="Eine Person mehr"
        disabled={value >= 100}
        onPress={() => props.onChange(value + 1)}
        testID="pc-people-plus"
      />
    </View>
  );
}

/** What starts selected in the pantry check: everything except "Vorrat". */
function defaultKept(rows: PantryCheckRow[]): Set<string> {
  return new Set(rows.filter((row) => !row.isPantry).map(rowKey));
}
