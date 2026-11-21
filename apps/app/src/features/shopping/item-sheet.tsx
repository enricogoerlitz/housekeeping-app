import {
  assignArticleArea,
  createArea,
  ITEM_NOTE_MAX_LENGTH,
  setItemNote,
  useAreas,
  useArticlesById,
  useShoppingItems,
} from '@housekeeping/api';
import {
  itemCount,
  matchSearchOrCreate,
  originSummary,
  summarizeItem,
  type Id,
} from '@housekeeping/core';
import {
  Button,
  Icon,
  List,
  ListRow,
  Row,
  SearchOrCreate,
  Sheet,
  Stack,
  Text,
  TextField,
} from '@housekeeping/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';

import { CountStepper, removeWithUndo } from './item-controls';

const NOTE_TOO_LONG = `Höchstens ${ITEM_NOTE_MAX_LENGTH} Zeichen`;

/** "Bereich" in "Posten bearbeiten": all areas, or "Suchen oder anlegen" while typing (AC-023, AC-024). */
function AreaPicker(props: { articleId: Id; onPicked: () => void }) {
  const areas = useAreas();
  const online = useOnlineOnly();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | undefined>();
  const result = matchSearchOrCreate(query, areas);
  const name = query.trim();

  // Assigning is a store action and works offline (ADR-0008 addendum).
  const pick = (areaId: Id) => {
    assignArticleArea(props.articleId, areaId);
    props.onPicked();
  };
  const create = () => {
    try {
      pick(createArea(name));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
    }
  };
  const sorted = [...areas].sort((a, b) => a.sort - b.sort);

  return (
    <Stack gap={12}>
      <SearchOrCreate
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setError(undefined);
        }}
        label="Bereich suchen"
        placeholder="Bereich suchen oder anlegen"
        clearLabel="Suche leeren"
        autoFocus
        hits={result.matches.map((match) => ({ key: match.item.id, title: match.item.name }))}
        onSelect={pick}
        createOptions={result.canCreate ? [{ key: 'area', label: `„${name}“ neu anlegen` }] : []}
        onCreate={create}
        brake={
          result.similar
            ? {
                question: `Meinst du ${result.similar.name}?`,
                acceptLabel: 'Ja',
                createAnywayLabel: 'Trotzdem neu',
                onAccept: () => {
                  if (result.similar) pick(result.similar.id);
                },
              }
            : undefined
        }
        createDisabledHint={online.hint}
        testID="item-area-search"
      />
      {error ? (
        <Text variant="small" color="warn" testID="item-area-error">
          {error}
        </Text>
      ) : null}
      {name === '' ? (
        <List testID="item-area-all">
          {sorted.map((area) => (
            <ListRow
              key={area.id}
              title={area.name}
              onPress={() => pick(area.id)}
              testID={`item-area-option-${area.id}`}
            />
          ))}
        </List>
      ) : null}
    </Stack>
  );
}

/**
 * "Posten bearbeiten" (REQ-004, medium window): Menge, Zusatz, Bereich, Herkunft, "Entfernen" and
 * "Fertig". Reads the item live; when someone else removes it, `onGone` tells the list (AC-027).
 */
export function ItemSheet(props: {
  itemId: Id;
  name: string;
  onClose: () => void;
  onGone: () => void;
}) {
  const items = useShoppingItems();
  const articlesById = useArticlesById();
  const areas = useAreas();
  const online = useOnlineOnly();
  const item = items.find((candidate) => candidate.id === props.itemId);
  const initialNote = item ? summarizeItem(item).notes.join(', ') : '';
  const [note, setNote] = useState(initialNote);
  const [noteError, setNoteError] = useState<string | undefined>();
  const [pickingArea, setPickingArea] = useState(false);

  const { onGone } = props;
  useEffect(() => {
    if (!item) onGone();
  }, [item, onGone]);
  if (!item) return null;

  const article = articlesById[item.articleId];
  const name = article?.name ?? props.name;
  const area = areas.find((candidate) => candidate.id === article?.areaId);
  const count = itemCount(item);
  const tooLong = note.trim().length > ITEM_NOTE_MAX_LENGTH;
  const fieldError = tooLong ? NOTE_TOO_LONG : noteError;

  const done = () => {
    if (tooLong) return;
    if (note.trim() !== initialNote.trim()) {
      try {
        setItemNote(item.id, note);
      } catch (caught) {
        setNoteError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
        return;
      }
    }
    props.onClose();
  };
  const remove = () => {
    props.onClose();
    removeWithUndo(item.id, name);
  };

  const footer = pickingArea ? (
    <Row gap={10} style={{ justifyContent: 'flex-start' }}>
      <Button
        label="Zurück"
        icon="chevron-left"
        variant="secondary"
        onPress={() => setPickingArea(false)}
        testID="item-area-back"
      />
    </Row>
  ) : (
    <Row gap={10} style={{ justifyContent: 'space-between' }}>
      <Button
        label="Entfernen"
        icon="trash"
        variant="ghost"
        disabled={online.disabled}
        hint={online.hint}
        onPress={remove}
        testID="item-sheet-remove"
      />
      <Button label="Fertig" disabled={tooLong} onPress={done} testID="item-sheet-done" />
    </Row>
  );

  return (
    <Sheet
      visible
      size="m"
      title={pickingArea ? `Bereich für ${name}` : name}
      onClose={props.onClose}
      footer={footer}
      testID="item-sheet"
    >
      {pickingArea ? (
        <AreaPicker articleId={item.articleId} onPicked={() => setPickingArea(false)} />
      ) : (
        <Stack gap={18}>
          <List>
            <ListRow
              title="Menge"
              trailing={
                count !== undefined ? (
                  <CountStepper
                    itemId={item.id}
                    name={name}
                    count={count}
                    onRemoved={props.onClose}
                    testID="item-sheet-count"
                  />
                ) : (
                  <Text variant="bodyStrong" testID="item-sheet-amount">
                    {summarizeItem(item).amount}
                  </Text>
                )
              }
            />
          </List>
          <TextField
            label="Zusatz"
            value={note}
            onChangeText={(value) => {
              setNote(value);
              setNoteError(undefined);
            }}
            placeholder="z. B. laktosefrei"
            hint={online.hint ?? 'Erscheint in Klammern hinter dem Artikel'}
            editable={!online.disabled}
            error={fieldError}
            returnKeyType="done"
            onSubmitEditing={done}
            testID="item-sheet-note"
          />
          <List>
            <ListRow
              title="Bereich"
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                  <Text color="muted" numberOfLines={1} testID="item-sheet-area-name">
                    {area?.name ?? 'Ohne Bereich'}
                  </Text>
                  <Icon name="chevron-right" size={18} color="muted" />
                </View>
              }
              accessibilityLabel={`Bereich: ${area?.name ?? 'Ohne Bereich'}`}
              onPress={() => setPickingArea(true)}
              testID="item-sheet-area"
            />
            <ListRow
              title="Herkunft"
              subtitle={<Text testID="item-sheet-origin">{originSummary(item)}</Text>}
            />
          </List>
        </Stack>
      )}
    </Sheet>
  );
}
