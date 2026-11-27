import { useArticlesById, useRecurringItems, useToday } from '@housekeeping/api';
import {
  recurringAmountLabel,
  recurringItemSubtitle,
  type Id,
  type RecurringItem,
} from '@housekeeping/core';
import {
  Button,
  CreateButton,
  EmptyState,
  List,
  ListRow,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  openKeyboardNow,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { useRecurringForm } from './recurring-form';

type Editing = { kind: 'new' } | { kind: 'existing'; id: Id };

/** The window of one Dauerposten (REQ-001): its fields, "Anlegen" / "Speichern", "Löschen". */
function RecurringSheet(props: {
  recurringId?: Id;
  articleId?: Id;
  onClose: () => void;
  onOpen: (recurringId: Id) => void;
}) {
  const form = useRecurringForm({
    recurringId: props.recurringId,
    articleId: props.articleId,
    onDone: props.onClose,
    onOpen: props.onOpen,
  });
  return (
    <Sheet
      visible
      size="m"
      title={form.title}
      onClose={props.onClose}
      // "Abbrechen · Speichern" like every form, also at the bottom on wide screens (review 0004).
      actions={{
        primary: form.save,
        cancel: { label: 'Abbrechen', onPress: props.onClose, testID: 'recurring-cancel' },
      }}
      footer={form.remove ? <Button {...form.remove} variant="ghost" /> : undefined}
      testID="recurring-sheet"
    >
      {form.body}
    </Sheet>
  );
}

function RecurringRow(props: {
  item: RecurringItem;
  name: string;
  today: string;
  onPress: () => void;
}) {
  const amount = recurringAmountLabel(props.item);
  return (
    <ListRow
      title={props.name}
      note={props.item.note}
      subtitle={recurringItemSubtitle(props.item, props.today)}
      trailing={
        amount ? (
          <Text variant="bodyStrong" color="muted" testID={`recurring-row-${props.item.id}-amount`}>
            {amount}
          </Text>
        ) : undefined
      }
      onPress={props.onPress}
      testID={`recurring-row-${props.item.id}`}
    />
  );
}

/**
 * "Dauerposten" (spec 0060, REQ-001), under "Verwalten" and from the list's ⋯: every Dauerposten
 * of the household with amount, rhythm and when it comes next; a row opens its window. Reading
 * works offline; changing needs the network.
 */
export function RecurringScreen() {
  const recurringItems = useRecurringItems();
  const articlesById = useArticlesById();
  const today = useToday();
  const online = useOnlineOnly();
  const { params } = usePageParams('dauerposten');
  // "‹ Liste" from the list's ⋯ (`von=liste`), otherwise "‹ Verwalten".
  const { label: backLabel, back } = useOriginBack(params.von, 'verwalten');
  const [editing, setEditing] = useState<Editing | undefined>();
  // iN-02 (review 0004): the window's "Artikel" takes the cursor. Without the tap's keyboard
  // (iPhone) its focus came later, outside the tap: the window rose for a keyboard that never
  // came and fell again after 1.5 s. Like every "… anlegen", the tap opens the keyboard now.
  const startNew = () => {
    openKeyboardNow();
    setEditing({ kind: 'new' });
  };

  const rows = recurringItems
    .flatMap((item) => {
      const article = articlesById[item.articleId];
      return article ? [{ item, name: article.name }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const addButton = (
    <CreateButton
      label="Dauerposten anlegen"
      disabled={online.disabled}
      hint={online.hint}
      onPress={startNew}
      testID="recurring-new"
    />
  );

  return (
    <Screen
      testID="recurring-screen"
      header={
        <ScreenHeader
          title="Dauerposten"
          backLabel={backLabel}
          onBack={back}
          right={addButton}
          testID="recurring-title"
        />
      }
    >
      <View style={{ width: '100%', maxWidth: 720, gap: 12 }}>
        {online.hint ? (
          <Text variant="small" color="warn" testID="recurring-screen-offline">
            {online.hint}
          </Text>
        ) : null}
        {rows.length === 0 ? (
          // N-11 (review 0004): "Dauerposten anlegen" stands once, in the head.
          <EmptyState
            icon="repeat"
            title="Noch keine Dauerposten"
            text="Was ihr regelmäßig braucht, kommt am fälligen Tag von selbst auf die Liste."
            testID="recurring-empty"
          />
        ) : (
          <>
            <Text variant="small" color="muted">
              Kommen am fälligen Tag von selbst auf die Einkaufsliste – nie doppelt.
            </Text>
            <List>
              {rows.map(({ item, name }) => (
                <RecurringRow
                  key={item.id}
                  item={item}
                  name={name}
                  today={today}
                  onPress={() => setEditing({ kind: 'existing', id: item.id })}
                />
              ))}
            </List>
          </>
        )}
      </View>
      {editing ? (
        <RecurringSheet
          key={editing.kind === 'new' ? 'new' : editing.id}
          recurringId={editing.kind === 'existing' ? editing.id : undefined}
          onClose={() => setEditing(undefined)}
          onOpen={(id) => setEditing({ kind: 'existing', id })}
        />
      ) : null}
    </Screen>
  );
}
