import {
  addPlannedToList,
  entryIdsOnLists,
  pantryCheckRows,
  snapshot,
  usePlanEntries,
  useRecipesById,
  useToday,
  type PantryCheckRow,
} from '@housekeeping/api';
import { parseISODate, weekdayShort, type Id, type ISODate } from '@housekeeping/core';
import {
  Button,
  CheckRow,
  Chip,
  GroupLabel,
  Icon,
  List,
  Row,
  Sheet,
  Stack,
  Text,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';

const LATER = 'later';

function dayChipLabel(date: ISODate): string {
  return `${weekdayShort(date)} ${parseISODate(date).getDate()}`;
}

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

/**
 * "Auf die Einkaufsliste": choose days of the plan, then keep only what is really needed
 * (Vorratscheck). Mount it fresh for every opening so the preselection is current.
 */
export function PantryCheckSheet(props: { weekDates: ISODate[]; listId: Id; onClose: () => void }) {
  const online = useOnlineOnly();
  const today = useToday();
  const entries = usePlanEntries();
  const recipesById = useRecipesById();

  const recipeEntriesOn = (day: string) =>
    entries.filter(
      (entry) =>
        entry.kind === 'recipe' &&
        entry.recipeId !== undefined &&
        recipesById[entry.recipeId] !== undefined &&
        (day === LATER ? entry.date === null : entry.date === day),
    );

  const [days, setDays] = useState<Set<string>>(() => {
    const onLists = entryIdsOnLists();
    return new Set(
      props.weekDates.filter(
        (date) => date >= today && recipeEntriesOn(date).some((entry) => !onLists.has(entry.id)),
      ),
    );
  });
  const [rows, setRows] = useState<PantryCheckRow[] | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPantry, setShowPantry] = useState(false);
  // Expanding "Vorrat & Gewürze" grows the small window to large once; it stays large until it
  // closes (spec 0005, AC-019). The sheet unmounts on close, which resets this.
  const [grown, setGrown] = useState(false);

  const chosenEntries = [...days].flatMap(recipeEntriesOn);
  const dishes = [
    ...new Set(
      chosenEntries.map(
        (entry) => (entry.recipeId ? recipesById[entry.recipeId]?.title : '') ?? '',
      ),
    ),
  ];

  const toggleDay = (day: string) => {
    const next = new Set(days);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setDays(next);
  };

  const next = () => {
    const found = pantryCheckRows(chosenEntries.map((entry) => entry.id));
    setRows(found);
    setSelected(new Set(found.filter((row) => !row.isPantry && row.articleId).map(rowKey)));
  };

  const toggleRow = (row: PantryCheckRow) => {
    const key = rowKey(row);
    const nextSelected = new Set(selected);
    if (nextSelected.has(key)) nextSelected.delete(key);
    else nextSelected.add(key);
    setSelected(nextSelected);
  };

  const apply = () => {
    if (!rows) return;
    const restore = snapshot();
    const count = addPlannedToList(
      props.listId,
      rows.filter((row) => selected.has(rowKey(row))),
    );
    props.onClose();
    toast.show({
      message: `${count} Artikel auf der Liste`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };

  if (!rows) {
    return (
      <Sheet
        visible
        onClose={props.onClose}
        title="Welche Tage?"
        testID="pantry-check-sheet"
        size="s"
        footer={
          <Button
            label="Weiter"
            icon="arrow-right"
            full
            disabled={online.disabled || chosenEntries.length === 0}
            hint={
              online.hint ??
              (chosenEntries.length === 0 ? 'Für diese Tage ist kein Rezept geplant.' : undefined)
            }
            testID="pc-next"
            onPress={next}
          />
        }
      >
        <Stack gap={14}>
          <Text color="muted">Die Zutaten dieser Tage kommen in den Vorratscheck.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {props.weekDates.map((date) => (
              <Chip
                key={date}
                label={dayChipLabel(date)}
                selected={days.has(date)}
                testID={`pc-day-${date}`}
                onPress={() => toggleDay(date)}
              />
            ))}
            <Chip
              label="Vorgemerkt"
              icon="bookmark"
              selected={days.has(LATER)}
              testID="pc-later"
              onPress={() => toggleDay(LATER)}
            />
          </View>
          <Text variant="small" color="muted" testID="pc-dishes">
            {dishes.length === 0 ? 'Noch kein Gericht gewählt.' : dishes.join(' · ')}
          </Text>
        </Stack>
      </Sheet>
    );
  }

  const needed = rows.filter((row) => !row.isPantry);
  const pantry = rows.filter((row) => row.isPantry);
  const renderRow = (row: PantryCheckRow) => (
    <CheckRow
      key={rowKey(row)}
      title={row.name}
      note={rowNote(row)}
      subtitle={
        row.articleId ? row.sources.join(' · ') : 'Nicht im Katalog – bitte von Hand eintragen'
      }
      checked={selected.has(rowKey(row))}
      disabled={!row.articleId}
      onToggle={() => toggleRow(row)}
      onPress={() => toggleRow(row)}
      trailing={
        row.amount ? (
          <Text variant="body" color="muted">
            {row.amount}
          </Text>
        ) : undefined
      }
      testID={`pc-row-${row.articleId ?? row.name}`}
    />
  );

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title="Was brauchst du wirklich?"
      testID="pantry-check-sheet"
      size={grown ? 'l' : 's'}
      footer={
        <Row gap={10}>
          <Button
            label="Zurück"
            variant="ghost"
            testID="pc-back"
            onPress={() => setRows(undefined)}
          />
          <View style={{ flex: 1 }}>
            <Button
              label={`${selected.size} übernehmen`}
              icon="check"
              full
              disabled={online.disabled || selected.size === 0}
              hint={online.hint}
              testID="pc-apply"
              onPress={apply}
            />
          </View>
        </Row>
      }
    >
      {rows.length === 0 ? (
        <Text color="muted">Für diese Gerichte ist nichts einzukaufen.</Text>
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
                onPress={() => {
                  setShowPantry(!showPantry);
                  setGrown(true);
                }}
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
