import {
  ITEM_NOTE_MAX_LENGTH,
  removeItemOrigin,
  setItemChecked,
  setItemNote,
  setManualAmount,
  snapshot,
  useAreas,
  useArticlesById,
  useShoppingItems,
  type ItemRemoval,
} from '@housekeeping/api';
import {
  AMOUNT_NOT_RECOGNIZED,
  itemCount,
  manualAmountText,
  noteChangeHint,
  originRows,
  parseItemAmount,
  summarizeItem,
  type Id,
  type ShoppingItem,
} from '@housekeeping/core';
import {
  Button,
  Icon,
  IconButton,
  List,
  ListRow,
  Row,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { MergeArticleDialog } from '@/features/articles/merge-article-dialog';
import { useArticleEditor } from '@/features/articles/article-sheet';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';
import { AreaPicker } from '@/features/stores/area-picker';

import { CountStepper, removeWithUndo } from './item-controls';
import { errorMessage } from '@/features/shell/error-message';

const NOTE_TOO_LONG = `Höchstens ${ITEM_NOTE_MAX_LENGTH} Zeichen`;
const FAILED = 'Das hat nicht geklappt.';

type Step = 'main' | 'area' | 'article';

/**
 * "Als erledigt markieren" and the swipe to the right on "Liste" (spec 0025, REQ-006): the store
 * action "abhaken" with onList, offline too, with "Rückgängig".
 */
export function checkOnList(itemId: Id, name: string): void {
  setItemChecked(itemId, true, { onList: true });
  toast.show({
    message: `${name} erledigt`,
    actionLabel: 'Rückgängig',
    onAction: () => setItemChecked(itemId, false),
  });
}

/** One origin from a recipe with its amount and ✕ (AC-010, AC-011). */
function OriginRow(props: {
  label: string;
  amount: string;
  disabled: boolean;
  hint: string | undefined;
  onRemove: () => void;
  testID: string;
}) {
  return (
    <ListRow
      title={props.label}
      trailing={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {props.amount ? (
            <Text color="muted" testID={`${props.testID}-amount`}>
              {props.amount}
            </Text>
          ) : null}
          <IconButton
            icon="x"
            label={`${props.label} entfernen`}
            disabled={props.disabled}
            hint={props.hint}
            onPress={props.onRemove}
            testID={`${props.testID}-remove`}
          />
        </View>
      }
      testID={props.testID}
    />
  );
}

/** The editor of "Artikel bearbeiten ›" inside the item's window; ✕ and "Fertig" lead back. */
function ArticleStep(props: { articleId: Id; onBack: () => void; onMerge: (id: Id) => void }) {
  const editor = useArticleEditor({
    articleId: props.articleId,
    onClose: props.onBack,
    onMerge: props.onMerge,
  });
  return (
    <Stack gap={12}>
      <Button
        label="Zurück zum Posten"
        icon="chevron-left"
        variant="link"
        size="sm"
        onPress={props.onBack}
        testID="item-article-back"
      />
      {editor.body}
      {editor.footer}
    </Stack>
  );
}

/**
 * "Posten bearbeiten" (spec 0006, REQ-004; spec 0025, REQ-003 to REQ-006, REQ-010): Menge, "Von
 * Hand", Zusatz with the hint on recipe Zusätze, Bereich, "Artikel bearbeiten ›", the origins
 * with ✕, "Als erledigt markieren", "Entfernen" and "Fertig". Reads the item live; when someone
 * else removes it, `onGone` tells the list (AC-013).
 */
export function ItemSheet(props: {
  itemId: Id;
  name: string;
  onClose: () => void;
  onGone: () => void;
}) {
  const items = useShoppingItems();
  const item = items.find((candidate) => candidate.id === props.itemId);
  const { onGone } = props;
  useEffect(() => {
    if (!item) onGone();
  }, [item, onGone]);
  if (!item) return null;
  return <ItemEditor {...props} item={item} />;
}

function ItemEditor(props: {
  item: ShoppingItem;
  name: string;
  onClose: () => void;
  onGone: () => void;
}) {
  const { item } = props;
  const articlesById = useArticlesById();
  const areas = useAreas();
  const online = useOnlineOnly();
  const initialNote = summarizeItem(item).notes.join(', ');
  const initialManual = manualAmountText(item);
  const [note, setNote] = useState(initialNote);
  const [manual, setManual] = useState(initialManual);
  const [error, setError] = useState<string | undefined>();
  const [step, setStep] = useState<Step>('main');
  const [merging, setMerging] = useState<Id | undefined>();

  const article = articlesById[item.articleId];
  const name = article?.name ?? props.name;
  const area = areas.find((candidate) => candidate.id === article?.areaId);
  const count = itemCount(item);
  const tooLong = note.trim().length > ITEM_NOTE_MAX_LENGTH;
  const manualAmount = count === undefined ? parseItemAmount(manual) : {};
  const manualError = manualAmount === undefined ? AMOUNT_NOT_RECOGNIZED : undefined;
  const noteHint = note.trim() === initialNote.trim() ? undefined : noteChangeHint(item, note);

  const write = (action: () => void): boolean => {
    try {
      action();
      return true;
    } catch (caught) {
      setError(errorMessage(caught, FAILED));
      return false;
    }
  };

  const done = () => {
    if (tooLong || manualError) return;
    if (note.trim() !== initialNote.trim() && !write(() => setItemNote(item.id, note))) return;
    if (count === undefined && manual.trim() !== initialManual.trim()) {
      const restore = snapshot();
      let removed = false;
      if (
        !write(() => {
          const change = setManualAmount(item.id, manual);
          if (change === null) props.onGone();
          removed = change?.removed === true;
        })
      ) {
        return;
      }
      props.onClose();
      if (removed) {
        toast.show({
          message: `${name} entfernt`,
          actionLabel: 'Rückgängig',
          onAction: undoAction(restore),
        });
      }
      return;
    }
    props.onClose();
  };

  const removeOrigin = (label: string, ids: Id[]) => {
    const restore = snapshot();
    let result: ItemRemoval | null;
    try {
      result = removeItemOrigin(item.id, ids);
    } catch (caught) {
      setError(errorMessage(caught, FAILED));
      return;
    }
    if (result === null) {
      props.onGone();
      return;
    }
    if (result.removed) props.onClose();
    toast.show({
      message: result.removed ? `${name} entfernt` : `${label} entfernt`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };

  const markDone = () => {
    props.onClose();
    checkOnList(item.id, name);
  };
  const remove = () => {
    props.onClose();
    removeWithUndo(item.id, name);
  };

  if (step === 'area') {
    return (
      <Sheet
        visible
        size="m"
        title={`Bereich für ${name}`}
        onClose={props.onClose}
        footer={
          <Row gap={10} style={{ justifyContent: 'flex-start' }}>
            <Button
              label="Zurück"
              icon="chevron-left"
              variant="secondary"
              onPress={() => setStep('main')}
              testID="item-area-back"
            />
          </Row>
        }
        testID="item-sheet"
      >
        <AreaPicker
          articleId={item.articleId}
          currentAreaId={article?.areaId}
          onPicked={() => setStep('main')}
          testID="item-area"
        />
      </Sheet>
    );
  }

  if (step === 'article') {
    return (
      <Sheet
        visible
        size="m"
        title="Artikel bearbeiten"
        onClose={props.onClose}
        testID="item-sheet"
      >
        <ArticleStep
          articleId={item.articleId}
          onBack={() => setStep('main')}
          onMerge={setMerging}
        />
        {merging ? (
          <MergeArticleDialog
            sourceId={item.articleId}
            targetId={merging}
            onCancel={() => setMerging(undefined)}
            onMerged={() => {
              setMerging(undefined);
              props.onClose();
            }}
          />
        ) : null}
      </Sheet>
    );
  }

  const origins = originRows(item);
  const footer = (
    <Row gap={10} style={{ justifyContent: 'space-between' }} wrap>
      <Button
        label="Entfernen"
        icon="trash"
        variant="ghost"
        disabled={online.disabled}
        hint={online.hint}
        onPress={remove}
        testID="item-sheet-remove"
      />
      <Row gap={10}>
        <Button
          label="Als erledigt markieren"
          icon="check"
          variant="secondary"
          onPress={markDone}
          testID="item-sheet-check"
        />
        <Button
          label="Fertig"
          disabled={tooLong || manualError !== undefined}
          onPress={done}
          testID="item-sheet-done"
        />
      </Row>
    </Row>
  );

  return (
    <Sheet
      visible
      size="m"
      title={name}
      onClose={props.onClose}
      footer={footer}
      testID="item-sheet"
    >
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
        {count === undefined ? (
          <TextField
            label="Von Hand"
            value={manual}
            onChangeText={(value) => {
              setManual(value);
              setError(undefined);
            }}
            placeholder="z. B. 500 g oder 2"
            hint={online.hint ?? 'Leer: nichts von Hand'}
            editable={!online.disabled}
            error={manualError}
            returnKeyType="done"
            onSubmitEditing={done}
            testID="item-sheet-manual"
          />
        ) : null}
        <TextField
          label="Zusatz"
          value={note}
          onChangeText={(value) => {
            setNote(value);
            setError(undefined);
          }}
          placeholder="z. B. laktosefrei"
          hint={online.hint ?? 'Erscheint in Klammern hinter dem Artikel'}
          editable={!online.disabled}
          error={tooLong ? NOTE_TOO_LONG : undefined}
          returnKeyType="done"
          onSubmitEditing={done}
          testID="item-sheet-note"
        />
        {noteHint && !online.hint ? (
          <Text variant="small" color="warn" testID="item-sheet-note-hint">
            {noteHint}
          </Text>
        ) : null}
        {error ? (
          <Text variant="small" color="warn" testID="item-sheet-error">
            {error}
          </Text>
        ) : null}
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
            onPress={() => setStep('area')}
            testID="item-sheet-area"
          />
          <ListRow
            title="Artikel bearbeiten"
            trailing={<Icon name="chevron-right" size={18} color="muted" />}
            onPress={() => setStep('article')}
            testID="item-sheet-article"
          />
        </List>
        {origins.length > 0 ? (
          <View>
            <Text variant="smallStrong" style={{ marginBottom: 6 }}>
              Herkunft
            </Text>
            <List testID="item-sheet-origins">
              {origins.map((origin, index) => (
                <OriginRow
                  key={origin.label}
                  label={origin.label}
                  amount={origin.amount}
                  disabled={online.disabled}
                  hint={online.hint}
                  onRemove={() => removeOrigin(origin.label, origin.contributionIds)}
                  testID={`item-sheet-origin-${index}`}
                />
              ))}
            </List>
          </View>
        ) : null}
      </Stack>
    </Sheet>
  );
}
