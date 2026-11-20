import {
  addAbsence,
  removeAbsence,
  snapshot,
  useAbsences,
  useCurrentMember,
  useMembers,
  useMembersById,
  useToday,
} from '@housekeeping/api';
import { formatShortDate, type ISODate } from '@housekeeping/core';
import {
  Avatar,
  Button,
  Chip,
  Icon,
  IconButton,
  List,
  ListRow,
  Row,
  Section,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';

import { DateChips } from '@/features/chores/date-chips';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

const HOUSEHOLD = 'household';

/**
 * "Abwesenheiten": who is away when. "Wer isst mit?" and the rotation leave absent people out.
 * Moved from the settings to its own page (spec 0005, AC-058); spec 0010 redesigns it.
 */
export function AbsenceSection() {
  const absences = useAbsences();
  const membersById = useMembersById();
  const online = useOnlineOnly();
  const [adding, setAdding] = useState(false);

  const remove = (id: string, who: string) => {
    const restore = snapshot();
    removeAbsence(id);
    toast.show({
      message: `Abwesenheit von ${who} entfernt`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };

  const sorted = [...absences].sort((a, b) => a.from.localeCompare(b.from));

  return (
    <Section testID="settings-absence">
      <Stack gap={12}>
        {sorted.length === 0 ? (
          <Text color="muted" testID="absence-empty">
            Niemand ist weg. Tragt Dienstreisen oder Urlaub ein, dann plant die App ohne euch.
          </Text>
        ) : (
          <List testID="absence-list">
            {sorted.map((absence) => {
              const member = absence.memberId ? membersById[absence.memberId] : undefined;
              const who = member?.name ?? 'Ganzer Haushalt';
              const range =
                absence.from === absence.to
                  ? formatShortDate(absence.from)
                  : `${formatShortDate(absence.from)} – ${formatShortDate(absence.to)}`;
              return (
                <ListRow
                  key={absence.id}
                  testID={`absence-${absence.id}`}
                  title={who}
                  subtitle={[range, absence.note].filter(Boolean).join(' · ')}
                  leading={
                    member ? (
                      <Avatar name={member.name} color={member.color} />
                    ) : (
                      <Icon name="house" color="muted" />
                    )
                  }
                  trailing={
                    <IconButton
                      icon="trash"
                      label={`Abwesenheit von ${who} entfernen`}
                      disabled={online.disabled}
                      onPress={() => remove(absence.id, who)}
                      testID={`absence-${absence.id}-remove`}
                    />
                  }
                />
              );
            })}
          </List>
        )}
        <Button
          label="Abwesenheit eintragen"
          icon="calendar-off"
          variant="secondary"
          disabled={online.disabled}
          hint={online.hint}
          onPress={() => setAdding(true)}
          testID="absence-new"
        />
        {online.hint ? (
          <Text variant="small" color="muted">
            {online.hint}
          </Text>
        ) : null}
      </Stack>
      <AbsenceSheet visible={adding} onClose={() => setAdding(false)} />
    </Section>
  );
}

function AbsenceSheet(props: { visible: boolean; onClose: () => void }) {
  const members = useMembers();
  const me = useCurrentMember();
  const today = useToday();
  const online = useOnlineOnly();
  const [who, setWho] = useState<string>(me.id);
  const [from, setFrom] = useState<ISODate>(today);
  const [to, setTo] = useState<ISODate>(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const close = () => {
    setWho(me.id);
    setFrom(today);
    setTo(today);
    setNote('');
    setError(undefined);
    props.onClose();
  };

  const save = () => {
    if (online.disabled) return;
    try {
      addAbsence({
        memberId: who === HOUSEHOLD ? undefined : who,
        from,
        to,
        note: note.trim() || undefined,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
      return;
    }
    toast.show({ message: 'Abwesenheit eingetragen' });
    close();
  };

  return (
    <Sheet
      visible={props.visible}
      onClose={close}
      title="Abwesenheit eintragen"
      testID="absence-sheet"
      width={600}
      footer={
        <Button
          label="Speichern"
          icon="check"
          full
          onPress={save}
          disabled={online.disabled}
          hint={online.hint}
          testID="absence-save"
        />
      }
    >
      <Stack gap={20}>
        <Stack gap={8}>
          <Text variant="smallStrong">Wer?</Text>
          <Row wrap gap={8}>
            {members.map((member) => (
              <Chip
                key={member.id}
                label={member.name}
                icon="user"
                selected={who === member.id}
                onPress={() => setWho(member.id)}
                testID={`absence-member-${member.id}`}
              />
            ))}
            <Chip
              label="Ganzer Haushalt"
              icon="house"
              selected={who === HOUSEHOLD}
              onPress={() => setWho(HOUSEHOLD)}
              testID="absence-household"
            />
          </Row>
        </Stack>
        <Stack gap={8}>
          <Text variant="smallStrong">Von</Text>
          <DateChips
            today={today}
            value={from}
            onChange={(value) => {
              if (!value) return;
              setFrom(value);
              if (value > to) setTo(value);
              setError(undefined);
            }}
            testIDPrefix="absence-from"
          />
        </Stack>
        <Stack gap={8}>
          <Text variant="smallStrong">Bis</Text>
          <DateChips
            today={today}
            value={to}
            onChange={(value) => {
              if (!value) return;
              setTo(value);
              if (value < from) setFrom(value);
              setError(undefined);
            }}
            testIDPrefix="absence-to"
          />
          {error ? (
            <Text variant="small" color="warn">
              {error}
            </Text>
          ) : null}
        </Stack>
        <TextField
          label="Notiz (optional)"
          placeholder="z. B. Dienstreise"
          value={note}
          onChangeText={setNote}
          testID="absence-note"
        />
      </Stack>
    </Sheet>
  );
}
