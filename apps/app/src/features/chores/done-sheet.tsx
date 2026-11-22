import {
  logDone,
  OfflineError,
  snapshot,
  useChores,
  useCurrentMember,
  useMembers,
  useToday,
  type DoneTarget,
} from '@housekeeping/api';
import {
  addDays,
  BACKFILL_DAYS,
  choreDraftErrors,
  choreDayLabel,
  doneOnChoices,
  matchSearchOrCreate,
  newChoreDraft,
  plannedFieldsOf,
  recurrenceLabel,
  type Chore,
  type Id,
  type ISODate,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  Menu,
  Row,
  SearchOrCreate,
  Sheet,
  Stack,
  Text,
  toast,
} from '@housekeeping/ui';
import { useMemo, useState } from 'react';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';
import { PlanDateCalendar } from '@/lib/plan-date-calendar';

import { AssignmentField, RhythmField, useChoreDraft } from './chore-form';

/** The day menu: a quick day, or „Datum …“ for the month calendar (spec 0026, REQ-007). */
type DayChoice = ISODate | 'pick';

/** What „Als erledigt eintragen“ books right now. */
type Choice = { kind: 'chore'; chore: Chore } | { kind: 'new'; title: string };

const NEW_KEY = 'new';

/**
 * „Was hast du erledigt?“ (REQ-006): search over all chores; a hit counts as done on the chosen
 * day (heute, gestern, vorgestern or „Datum …“ up to 30 days back, spec 0026) by the chosen person, and its next date moves on as when
 * checking it off (AC-036 to AC-038). Without a hit a new chore „bei Bedarf“ is created and booked
 * (AC-039); with „Mehr Angaben“ it gets a rhythm and an assignment right away (AC-040). A
 * look-alike brakes with „Meinst du …?“ (AC-041). Searching works offline, booking does not
 * (AC-042).
 */
export function DoneSheet(props: { visible: boolean; onClose: () => void }) {
  const chores = useChores();
  const members = useMembers();
  const me = useCurrentMember();
  const today = useToday();
  const online = useOnlineOnly();

  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Choice | undefined>(undefined);
  const [doneBy, setDoneBy] = useState<Id>(me.id);
  const [doneOn, setDoneOn] = useState<ISODate>(today);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // Without „Mehr Angaben“ a new chore is „bei Bedarf“ for anyone (D27).
  const [draft, update, resetDraft] = useChoreDraft(() => ({
    ...newChoreDraft(today, me.id, 'asNeeded'),
    assignment: 'anyone',
  }));

  const items = useMemo(
    () => chores.map((chore) => ({ id: chore.id, name: chore.title, chore })),
    [chores],
  );
  const result = matchSearchOrCreate(query, items);
  const title = query.trim();
  const choices = doneOnChoices(today);
  const dayLabel =
    choices.find((choice) => choice.date === doneOn)?.label ?? choreDayLabel(doneOn, today);

  // Typing the exact name counts as choosing it. A fresh name becomes a new chore without a tap
  // on „als neue Aufgabe“ when nothing else matches or when „Mehr Angaben“ were filled in.
  const describedNew = draft.touched.rhythm || draft.touched.assignment;
  const choice: Choice | undefined =
    picked ??
    (result.exact
      ? { kind: 'chore', chore: result.exact.chore }
      : title !== '' &&
          result.canCreate &&
          !result.similar &&
          (result.matches.length === 0 || describedNew)
        ? { kind: 'new', title }
        : undefined);

  const close = () => {
    setQuery('');
    setPicked(undefined);
    setDoneBy(me.id);
    setDoneOn(today);
    setPicking(false);
    setError(undefined);
    resetDraft();
    props.onClose();
  };

  const pickChore = (chore: Chore) => {
    setQuery(chore.title);
    setPicked({ kind: 'chore', chore });
    setError(undefined);
  };

  const save = () => {
    if (!choice || online.disabled) return;
    const weekdayError = choice.kind === 'new' ? choreDraftErrors(draft).weekdays : undefined;
    if (weekdayError) {
      setError(weekdayError);
      return;
    }
    const target: DoneTarget =
      choice.kind === 'chore'
        ? { choreId: choice.chore.id }
        : { title: choice.title, ...plannedFieldsOf(draft, members) };
    const restore = snapshot();
    try {
      if (!logDone(target, { doneOn, doneBy })) {
        setError('Diese Aufgabe gibt es nicht mehr.');
        return;
      }
    } catch (caught) {
      setError(
        caught instanceof OfflineError
          ? online.hint
          : caught instanceof Error
            ? caught.message
            : 'Das hat nicht geklappt.',
      );
      return;
    }
    const name = choice.kind === 'chore' ? choice.chore.title : choice.title;
    toast.show({
      message: `„${name}“ eingetragen`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
    close();
  };

  const chosenText =
    choice === undefined
      ? undefined
      : choice.kind === 'chore'
        ? `${choice.chore.title} · ${recurrenceLabel(choice.chore.recurrence)}`
        : `Neu: ${choice.title} · ${recurrenceLabel(plannedFieldsOf(draft, members).recurrence)}`;

  return (
    <Sheet
      visible={props.visible}
      onClose={close}
      title="Was hast du erledigt?"
      size="l"
      testID="chore-done-sheet"
      footer={
        <Stack gap={12}>
          {chosenText ? (
            <Text variant="smallStrong" numberOfLines={1} testID="chore-done-chosen">
              {chosenText}
            </Text>
          ) : null}
          <Row wrap gap={8} justify="space-between">
            <Row wrap gap={8}>
              <Text variant="small" color="muted">
                Erledigt von
              </Text>
              {members.map((member) => (
                <Chip
                  key={member.id}
                  label={member.name}
                  icon="user"
                  selected={doneBy === member.id}
                  onPress={() => setDoneBy(member.id)}
                  testID={`chore-done-by-${member.id}`}
                />
              ))}
            </Row>
            <Menu<DayChoice>
              label={dayLabel}
              accessibilityLabel={`Tag: ${dayLabel}`}
              value={doneOn}
              onChange={(choice) => {
                if (choice === 'pick') {
                  setPicking(true);
                  return;
                }
                setPicking(false);
                setDoneOn(choice);
              }}
              options={[
                ...choices.map((option) => ({ value: option.date, label: option.label })),
                { value: 'pick' as const, label: 'Datum …' },
              ]}
              testID="chore-done-day"
            />
          </Row>
          {picking ? (
            <PlanDateCalendar
              month={doneOn}
              today={today}
              marked={doneOn}
              isDisabled={(date) => date > today || date < addDays(today, -BACKFILL_DAYS)}
              onSelect={(date) => {
                setDoneOn(date);
                setPicking(false);
              }}
              testID="chore-done-calendar"
            />
          ) : null}
          {error ? (
            <Text variant="small" color="warn" testID="chore-done-error">
              {error}
            </Text>
          ) : null}
          <Button
            label="Als erledigt eintragen"
            icon="check"
            full
            disabled={online.disabled || choice === undefined}
            hint={
              online.hint ??
              (choice === undefined ? 'Such eine Aufgabe oder leg eine an' : undefined)
            }
            onPress={save}
            testID="chore-done-save"
          />
          {online.hint ? (
            <Text variant="small" color="warn" testID="chore-done-offline">
              {online.hint}
            </Text>
          ) : null}
        </Stack>
      }
    >
      <SearchOrCreate
        query={query}
        onQueryChange={(next) => {
          setQuery(next);
          setPicked(undefined);
          setError(undefined);
        }}
        label="Aufgabe suchen"
        placeholder="z. B. Fenster putzen"
        clearLabel="Suche leeren"
        hits={result.matches.map(({ item }) => ({
          key: item.id,
          title: item.name,
          meta: recurrenceLabel(item.chore.recurrence),
        }))}
        onSelect={(key) => {
          const hit = items.find((item) => item.id === key);
          if (hit) pickChore(hit.chore);
        }}
        createOptions={
          result.canCreate ? [{ key: NEW_KEY, label: `„${title}“ als neue Aufgabe` }] : []
        }
        onCreate={() => {
          setPicked({ kind: 'new', title });
          setError(undefined);
        }}
        brake={
          result.similar
            ? {
                question: `Meinst du ${result.similar.name}?`,
                acceptLabel: 'Ja',
                createAnywayLabel: 'Trotzdem neu',
                onAccept: () => {
                  if (result.similar) pickChore(result.similar.chore);
                },
              }
            : undefined
        }
        more={
          result.canCreate
            ? {
                label: 'Mehr Angaben (Rhythmus, wer)',
                children: (
                  <Stack gap={16}>
                    <RhythmField draft={draft} update={update} today={today} prefix="chore-done-" />
                    <AssignmentField
                      draft={draft}
                      update={update}
                      members={members}
                      prefix="chore-done-"
                    />
                  </Stack>
                ),
              }
            : undefined
        }
        autoFocus
        testID="chore-done-search"
      />
    </Sheet>
  );
}
