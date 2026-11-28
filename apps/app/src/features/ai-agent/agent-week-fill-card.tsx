import { agentProposalData, planSuggested, snapshot, syncNow, useTrips } from '@housekeeping/api';
import {
  addDays,
  fillWeek,
  fillWeekLabel,
  formatShortDate,
  freeEvenings,
  weekdayShort,
  type AgentEntityRef,
  type AgentExtra,
  type ISODate,
  type WeekFillRow,
} from '@housekeeping/core';
import { Button, Icon, SelectRow, Surface, Text, toast } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { useSuggestionInput } from '@/features/meal-plan/plan-suggestions';
import { errorMessage } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';
import { PantryCheckSheet } from '@/features/shopping/pantry-check-sheet';

import { AgentEntities } from './agent-entities';

// Spec 0067, REQ-014: "Füll die Woche: 2× vegetarisch, Mittwoch wenig Zeit, Samstag Gäste". The
// agent only passed the wishes; the dishes come from the suggestion logic of spec 0063 on this
// device (core fillWeek), trips and occupied evenings are checked by the code. The card is a
// collect card (REQ-009): each evening with a check mark, "5 Abende einplanen" plans the ticked
// ones in one change like "Was kochen wir?" (planSuggested), "Rückgängig" takes it back, then
// "Auf die Liste" opens the usual window. Before planning the plan is read again: an evening
// taken meanwhile is unticked with a hint. The planned dishes stand under the card as its result
// (preview 28.11.: every change through the chat ends with a card of what it touched).

const day = (date: ISODate) => `${weekdayShort(date)} ${formatShortDate(date)}`;
const TAKEN_HINT = 'Inzwischen belegt';

function rangeOf(from: ISODate, to: ISODate): ISODate[] {
  const days: ISODate[] = [];
  for (let date = from; date <= to && days.length < 14; date = addDays(date, 1)) days.push(date);
  return days;
}

export function AgentWeekFillCard(props: {
  extra: Extract<AgentExtra, { kind: 'week_fill' }>;
  /** From "Verlauf": shown, not planned again. */
  loaded: boolean;
  testID: string;
}) {
  const { extra, testID } = props;
  const input = useSuggestionInput();
  const trips = useTrips();
  const online = useOnlineOnly();
  // The week as it was proposed; the data moving on must not reshuffle it under the finger.
  const [result] = useState(() => fillWeek(input, trips, extra.wishes));
  const [selected, setSelected] = useState<ReadonlySet<ISODate>>(
    () => new Set(result.rows.map((row) => row.date)),
  );
  const [taken, setTaken] = useState<ReadonlySet<ISODate>>(new Set());
  const [planned, setPlanned] = useState<ReadonlySet<ISODate>>(new Set());
  const [restore, setRestore] = useState<(() => void) | undefined>();
  const [busy, setBusy] = useState(false);
  const [toList, setToList] = useState(false);

  const chosen = result.rows.filter((row) => selected.has(row.date) && !planned.has(row.date));
  const toggle = (date: ISODate) => {
    const next = new Set(selected);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    setSelected(next);
  };

  const plan = async () => {
    if (busy || chosen.length === 0 || online.disabled) return;
    setBusy(true);
    // Read again: another device may have planned an evening meanwhile (REQ-009).
    await syncNow().catch(() => undefined);
    const free = new Set(
      freeEvenings(
        agentProposalData().planEntries,
        chosen.map((row) => row.date),
        result.slotId,
        input.today,
      ),
    );
    const ready = chosen.filter((row) => free.has(row.date));
    const gone = chosen.filter((row) => !free.has(row.date)).map((row) => row.date);
    if (gone.length > 0) {
      setTaken(new Set([...taken, ...gone]));
      setSelected(new Set([...selected].filter((date) => !gone.includes(date))));
    }
    if (ready.length > 0) {
      const undo = snapshot();
      try {
        planSuggested(
          ready.map((row: WeekFillRow) => ({
            recipeId: row.suggestion.recipe.id,
            date: row.date,
            ...(row.suggestion.plannedLaterEntryId
              ? { plannedLaterEntryId: row.suggestion.plannedLaterEntryId }
              : {}),
            ...(row.guests > 0 ? { guests: row.guests } : {}),
          })),
          result.slotId,
        );
        setPlanned(new Set([...planned, ...ready.map((row) => row.date)]));
        setRestore(() => undo);
      } catch (error) {
        toast.show({ message: errorMessage(error) });
      }
    }
    setBusy(false);
  };

  const undoAll = () => {
    if (!restore) return;
    try {
      restore();
      setPlanned(new Set());
      setRestore(undefined);
    } catch (error) {
      toast.show({ message: errorMessage(error) });
    }
  };

  const made = result.rows
    .filter((row) => planned.has(row.date))
    .map((row): AgentEntityRef => ({ kind: 'recipe', id: row.suggestion.recipe.id }))
    .filter((ref, index, all) => all.findIndex((other) => other.id === ref.id) === index);
  const title = `Woche ${formatShortDate(extra.wishes.from)}–${formatShortDate(extra.wishes.to)}`;
  return (
    <Surface testID={testID} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="calendar-days" size={18} color="accent" />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {title}
        </Text>
      </View>
      {props.loaded ? (
        <Text variant="small" color="muted" testID={`${testID}-loaded`}>
          Vorschlag aus diesem Chat – zum Einplanen frag noch einmal.
        </Text>
      ) : null}
      {/* From "Verlauf" the week has moved on: only what it was (the hint above), no new plan. */}
      {result.empty && !props.loaded ? (
        <Text variant="small" color="muted" testID={`${testID}-empty`}>
          {result.empty}
        </Text>
      ) : null}
      <View>
        {(props.loaded ? [] : result.rows).map((row) => {
          const rowId = `${testID}-row-${row.date}`;
          const subtitle = [day(row.date), ...row.notes, row.suggestion.facts]
            .filter(Boolean)
            .join(' · ');
          if (props.loaded || planned.has(row.date)) {
            return (
              <View
                key={row.date}
                testID={rowId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 48,
                  paddingVertical: 6,
                  paddingHorizontal: 4,
                }}
              >
                <Icon
                  name={planned.has(row.date) ? 'check' : 'calendar-days'}
                  size={18}
                  color={planned.has(row.date) ? 'accent' : 'muted'}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="rowTitle">{row.suggestion.recipe.title}</Text>
                  <Text variant="small" color="muted" testID={`${rowId}-status`}>
                    {planned.has(row.date) ? `${subtitle} · Eingeplant` : subtitle}
                  </Text>
                </View>
              </View>
            );
          }
          return (
            <SelectRow
              key={row.date}
              title={row.suggestion.recipe.title}
              subtitle={subtitle}
              hint={taken.has(row.date) ? TAKEN_HINT : row.suggestion.reason || undefined}
              selected={selected.has(row.date)}
              disabled={busy}
              onToggle={() => toggle(row.date)}
              testID={rowId}
            />
          );
        })}
      </View>
      {result.skipped.length > 0 && !props.loaded ? (
        <Text variant="small" color="muted" testID={`${testID}-skipped`}>
          {result.skipped.map((skip) => `${day(skip.date)}: ${skip.reason}`).join(' · ')}
        </Text>
      ) : null}
      {!props.loaded && result.rows.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          {chosen.length > 0 ? (
            <Button
              label={fillWeekLabel(chosen.length)}
              icon="check"
              size="sm"
              disabled={busy || online.disabled}
              hint={online.hint}
              onPress={() => void plan()}
              testID={`${testID}-apply`}
            />
          ) : null}
          {restore ? (
            <>
              <Button
                label="Auf die Liste"
                icon="shopping-basket"
                variant="secondary"
                size="sm"
                disabled={online.disabled}
                hint={online.hint}
                onPress={() => setToList(true)}
                testID={`${testID}-to-list`}
              />
              <Button
                label="Rückgängig"
                icon="undo"
                variant="secondary"
                size="sm"
                disabled={busy || online.disabled}
                hint={online.hint}
                onPress={undoAll}
                testID={`${testID}-undo`}
              />
            </>
          ) : null}
        </View>
      ) : null}
      {made.length > 0 ? (
        <AgentEntities
          extra={{ kind: 'entities', id: `${extra.id}-made`, items: made }}
          testID={`${testID}-made`}
        />
      ) : null}
      {toList ? (
        <PantryCheckSheet
          weekDates={rangeOf(extra.wishes.from, extra.wishes.to)}
          onClose={() => setToList(false)}
        />
      ) : null}
    </Surface>
  );
}
