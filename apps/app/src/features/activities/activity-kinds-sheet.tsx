import {
  deleteActivityKind,
  updateActivityKind,
  useActivities,
  useActivityKinds,
} from '@housekeeping/api';
import { KIND_NAME_MAX_LENGTH, type ActivityIcon, type ActivityKind } from '@housekeeping/core';
import {
  Button,
  Icon,
  IconChoice,
  List,
  ListRow,
  Row,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';

import { confirmFirst } from '@/features/shell/confirm-dialog';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';

import { ACTIVITY_ICON_OPTIONS } from './activity-photo';

/** "3 Aktivitäten", "1 Aktivität", "keine Aktivität". */
function countLabel(count: number): string {
  if (count === 0) return 'keine Aktivität';
  return count === 1 ? '1 Aktivität' : `${count} Aktivitäten`;
}

/**
 * "Arten" under "Verwalten" → "Aktivitäten" (spec 0041, REQ-001): every kind with its symbol and
 * how many activities have it; a tap renames it, gives it another symbol or deletes it after
 * asking (AC-003: its activities stay, without a kind). New kinds come from the activity form.
 */
export function ActivityKindsSheet(props: { onClose: () => void }) {
  const kinds = useActivityKinds();
  const activities = useActivities();
  const online = useOnlineOnly();
  const [editing, setEditing] = useState<ActivityKind | undefined>();
  const usage = (kindId: string) =>
    activities.filter((activity) => activity.kindId === kindId).length;

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={editing ? `„${editing.name}“ bearbeiten` : 'Arten'}
      size="m"
      testID="activity-kinds-sheet"
    >
      {online.hint ? (
        <Text variant="small" color="warn" style={{ marginBottom: 8 }}>
          {online.hint}
        </Text>
      ) : null}
      {editing ? (
        <KindEditor
          kind={editing}
          usage={usage(editing.id)}
          offline={online.disabled}
          offlineHint={online.hint}
          onDone={() => setEditing(undefined)}
        />
      ) : (
        <Stack gap={10}>
          <Text variant="small" color="muted">
            Neue Arten legst du beim Anlegen einer Aktivität an.
          </Text>
          <List testID="activity-kinds-list">
            {kinds.map((kind) => (
              <ListRow
                key={kind.id}
                title={kind.name}
                subtitle={countLabel(usage(kind.id))}
                leading={<Icon name={kind.icon} color="muted" />}
                trailing={<Icon name="chevron-right" size={20} color="muted" />}
                onPress={() => setEditing(kind)}
                testID={`activity-kind-row-${kind.id}`}
              />
            ))}
          </List>
        </Stack>
      )}
    </Sheet>
  );
}

function KindEditor(props: {
  kind: ActivityKind;
  usage: number;
  offline: boolean;
  offlineHint: string | undefined;
  onDone: () => void;
}) {
  const [name, setName] = useState(props.kind.name);
  const [icon, setIcon] = useState<ActivityIcon>(props.kind.icon);
  const [error, setError] = useState<string | undefined>();

  const save = () => {
    try {
      updateActivityKind(props.kind.id, { name, icon });
    } catch (caught) {
      setError(errorMessage(caught, FAILED_MESSAGE));
      return;
    }
    toast.show({ message: 'Art gespeichert' });
    props.onDone();
  };
  const remove = () =>
    confirmFirst({
      title: `„${props.kind.name}“ löschen?`,
      message:
        props.usage === 0
          ? 'Keine Aktivität hat diese Art.'
          : `${countLabel(props.usage)} behalten ihre Einträge und haben danach keine Art mehr.`,
      confirmLabel: 'Löschen',
      testID: 'activity-kind-delete-confirm',
      onConfirm: () => {
        try {
          deleteActivityKind(props.kind.id);
        } catch (caught) {
          return errorMessage(caught, FAILED_MESSAGE);
        }
        toast.show({ message: `„${props.kind.name}“ gelöscht` });
        props.onDone();
        return undefined;
      },
    });

  return (
    <Stack gap={14}>
      <TextField
        label="Name"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setError(undefined);
        }}
        maxLength={KIND_NAME_MAX_LENGTH}
        error={error}
        testID="activity-kind-name"
      />
      <IconChoice
        label="Symbol"
        options={ACTIVITY_ICON_OPTIONS}
        value={icon}
        onChange={setIcon}
        testID="activity-kind-icon"
      />
      <Row gap={10} wrap>
        <Button
          label="Speichern"
          icon="check"
          disabled={props.offline}
          hint={props.offlineHint}
          onPress={save}
          testID="activity-kind-save"
        />
        <Button
          label="Zurück"
          variant="secondary"
          onPress={props.onDone}
          testID="activity-kind-back"
        />
        <Button
          label="Löschen"
          icon="trash"
          variant="link"
          disabled={props.offline}
          hint={props.offlineHint}
          onPress={remove}
          testID="activity-kind-delete"
        />
      </Row>
    </Stack>
  );
}
