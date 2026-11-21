import { addAreaToStore, fullAreaOrder, useAreas, useStores } from '@housekeeping/api';
import { matchSearchOrCreate, validateAreaName, type Area, type Id } from '@housekeeping/core';
import {
  Button,
  Row,
  SearchOrCreate,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

import { messageOf } from './labels';

/**
 * A name in a small window: "Neuer Markt", ✎ "Markt umbenennen", "Neuer Bereich", "Umbenennen".
 * `onSubmit` saves and returns the message for the field when it cannot ("Name fehlt").
 */
export function NameSheet(props: {
  title: string;
  label: string;
  placeholder?: string;
  initialName?: string;
  submitLabel: string;
  onSubmit: (name: string) => string | undefined;
  onClose: () => void;
  testID: string;
}) {
  const online = useOnlineOnly();
  const [name, setName] = useState(props.initialName ?? '');
  const [error, setError] = useState<string | undefined>();
  const submit = () => {
    if (online.disabled) return;
    const problem = props.onSubmit(name);
    if (problem) setError(problem);
  };
  return (
    <Sheet
      visible
      size="s"
      title={props.title}
      onClose={props.onClose}
      testID={props.testID}
      footer={
        <Row gap={10} style={{ justifyContent: 'flex-end' }}>
          <Button
            label="Abbrechen"
            variant="secondary"
            onPress={props.onClose}
            testID={`${props.testID}-cancel`}
          />
          <Button
            label={props.submitLabel}
            disabled={online.disabled}
            hint={online.hint}
            onPress={submit}
            testID={`${props.testID}-save`}
          />
        </Row>
      }
    >
      <TextField
        label={props.label}
        value={name}
        onChangeText={(value) => {
          setName(value);
          setError(undefined);
        }}
        placeholder={props.placeholder}
        error={error}
        hint={online.hint}
        editable={!online.disabled}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
        testID={`${props.testID}-name`}
      />
    </Sheet>
  );
}

/** A small window that asks before something is lost: "Rewe Südstadt löschen?" (AC-045). */
export function ConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => string | undefined;
  onCancel: () => void;
  testID: string;
}) {
  const online = useOnlineOnly();
  const [error, setError] = useState<string | undefined>();
  return (
    <Sheet
      visible
      size="s"
      title={props.title}
      onClose={props.onCancel}
      testID={props.testID}
      footer={
        <Row gap={10} style={{ justifyContent: 'flex-end' }}>
          <Button
            label="Abbrechen"
            variant="secondary"
            onPress={props.onCancel}
            testID={`${props.testID}-cancel`}
          />
          <Button
            label={props.confirmLabel}
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => setError(props.onConfirm())}
            testID={`${props.testID}-confirm`}
          />
        </Row>
      }
    >
      <Stack gap={10}>
        <Text testID={`${props.testID}-text`}>{props.message}</Text>
        {error || online.hint ? (
          <Text variant="small" color="warn" testID={`${props.testID}-error`}>
            {error ?? online.hint}
          </Text>
        ) : null}
      </Stack>
    </Sheet>
  );
}

/**
 * "+ Bereich hinzufügen" in a store (AC-048, AC-049): an area of the household that is hidden
 * here shows "ausgeblendet" and comes back at its place; a new name creates the area for the whole
 * household, last in this walking order.
 */
export function AddAreaSheet(props: { storeId: Id; onClose: () => void }) {
  const areas = useAreas();
  const stores = useStores();
  const online = useOnlineOnly();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | undefined>();
  const store = stores.find((candidate) => candidate.id === props.storeId);
  if (!store) return null;

  const order = fullAreaOrder(store);
  const result = matchSearchOrCreate(query, areas);
  const name = query.trim().replace(/\s+/g, ' ');
  const visible = (area: Area) => order.includes(area.id) && !store.hiddenAreaIds.includes(area.id);

  const pick = (areaId: Id) => {
    const area = areas.find((candidate) => candidate.id === areaId);
    if (!area) return;
    if (visible(area)) {
      props.onClose();
      return;
    }
    try {
      addAreaToStore(store.id, { areaId });
    } catch (caught) {
      setError(messageOf(caught));
      return;
    }
    toast.show({ message: `„${area.name}“ ist wieder sichtbar` });
    props.onClose();
  };
  const create = () => {
    const problem = validateAreaName(name, areas);
    if (problem && problem.kind !== 'taken') {
      setError(problem.message);
      return;
    }
    try {
      addAreaToStore(store.id, { name });
    } catch (caught) {
      setError(messageOf(caught));
      return;
    }
    toast.show({ message: `„${name}“ angelegt` });
    props.onClose();
  };

  return (
    <Sheet
      visible
      size="l"
      title="Bereich hinzufügen"
      onClose={props.onClose}
      testID="add-area-sheet"
    >
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
          hits={result.matches.map(({ item }) => ({
            key: item.id,
            title: item.name,
            meta: visible(item) ? 'schon dabei' : 'ausgeblendet',
          }))}
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
          testID="add-area-search"
        />
        {error ? (
          <Text variant="small" color="warn" testID="add-area-error">
            {error}
          </Text>
        ) : null}
        {name === '' ? (
          <Text variant="small" color="muted">
            Tipp den Namen eines Bereichs. Ein neuer Bereich gilt für den ganzen Haushalt und steht
            in jedem Markt am Ende.
          </Text>
        ) : null}
      </Stack>
    </Sheet>
  );
}

/** "Zusammenlegen mit …" (AC-054): pick the area that stays; the screen asks before merging. */
export function MergeAreaPicker(props: {
  sourceId: Id;
  onPick: (targetId: Id) => void;
  onClose: () => void;
}) {
  const areas = useAreas();
  const [query, setQuery] = useState('');
  const source = areas.find((area) => area.id === props.sourceId);
  if (!source) return null;
  const others = areas.filter((area) => area.id !== source.id);
  const hits = query.trim()
    ? matchSearchOrCreate(query, others, { limit: others.length }).matches.map(({ item }) => item)
    : [...others].sort((a, b) => a.sort - b.sort);

  return (
    <Sheet
      visible
      size="l"
      title={`${source.name} zusammenlegen mit …`}
      onClose={props.onClose}
      testID="merge-area-sheet"
    >
      <SearchOrCreate
        query={query}
        onQueryChange={setQuery}
        label="Bereich suchen"
        placeholder="Bereich suchen"
        clearLabel="Suche leeren"
        autoFocus
        hits={hits.map((area) => ({ key: area.id, title: area.name }))}
        onSelect={props.onPick}
        createOptions={[]}
        onCreate={() => undefined}
        testID="merge-area-search"
      />
    </Sheet>
  );
}
