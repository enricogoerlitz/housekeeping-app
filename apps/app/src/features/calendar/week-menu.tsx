import {
  defaultEaterIds,
  OfflineError,
  planSuggested,
  snapshot,
  useShoppingItems,
} from '@housekeeping/api';
import {
  assignmentPrepNote,
  distributeWeek,
  entriesNotOnList,
  formatShortDate,
  freeEvenings,
  weekDates,
  weekdayShort,
  weekLineLabel,
  weekListLabel,
  weekMenu,
  weekPlanLabel,
  weekPlannedNotice,
  type Evening,
  type Id,
  type ISODate,
  type PlanSuggestion,
} from '@housekeeping/core';
import {
  Button,
  CheckboxMark,
  Chip,
  GroupLabel,
  Icon,
  List,
  Menu,
  Sheet,
  Text,
  keyboardFocusRing,
  toast,
  useBreakpoint,
  useTheme,
  type MenuOption,
} from '@housekeeping/ui';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  FreshHint,
  PLAN_ONLINE_HINT,
  SuggestionRow,
  useSuggestionInput,
} from '@/features/meal-plan/plan-suggestions';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import { OFFLINE_EDIT_HINT, undoAction, useOnlineOnly } from '@/features/shell/offline';

// "Was kochen wir?" (spec 0063, Variante C): the quiet line above the week and the Wochenkarte.
// One tap on what one fancies, the app spreads it over the free evenings, one tap saves it all.

/** The Tageszeit the Wochenkarte fills: the household's last one ("Abend"). */
function lastSlotOf(slots: readonly { id: Id; sort: number; name: string }[]) {
  return [...slots].sort((a, b) => a.sort - b.sort)[slots.length - 1];
}

function eveningsOf(dates: readonly ISODate[], slotId: Id): Evening[] {
  const eaterIds = defaultEaterIds();
  return dates.map((date) => ({ date, slotId, eaterIds }));
}

/** The quiet row above the week (REQ-008, REQ-011): text on the left, the action on the right. */
function WeekLine(props: {
  icon: 'lightbulb' | 'shopping-basket';
  text: string;
  action: string;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.text}, ${props.action}`}
      onPress={props.onPress}
      testID={props.testID}
      style={(state) => {
        const { pressed, focused } = state as { pressed: boolean; focused?: boolean };
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            minHeight: 44,
            paddingVertical: 6,
            opacity: pressed ? 0.7 : 1,
          },
          keyboardFocusRing(theme, focused),
        ];
      }}
    >
      <Icon name={props.icon} size={18} color="muted" />
      <Text variant="small" color="muted" style={{ flex: 1 }}>
        {props.text}
      </Text>
      <Text variant="smallStrong" color="accent">
        {`${props.action} ›`}
      </Text>
    </Pressable>
  );
}

/**
 * Above the week (REQ-008): "5 Abende frei · Was kochen wir? ›" from two free evenings and four
 * fitting dishes on; after planning from it "4 Gerichte nicht auf der Liste · Auf die Liste ›"
 * while some of those dishes have nothing on the list (REQ-011, Entscheidung 10).
 */
export function WeekMenuLine(props: {
  weekStart: ISODate;
  /** The entries just planned from the Wochenkarte in this week. */
  planned: readonly Id[];
  onOpen: () => void;
  onToList: () => void;
}) {
  const input = useSuggestionInput();
  const items = useShoppingItems();
  const slot = lastSlotOf(input.slots);
  const free = useMemo(
    () =>
      slot ? freeEvenings(input.entries, weekDates(props.weekStart), slot.id, input.today) : [],
    [input.entries, input.today, props.weekStart, slot],
  );
  const offered = useMemo(
    () => (slot && free.length >= 2 ? weekMenu(input, eveningsOf(free, slot.id)) : undefined),
    [input, free, slot],
  );
  const stillPlanned = props.planned.filter((id) =>
    input.entries.some((entry) => entry.id === id && entry.date !== null),
  );
  const missing = entriesNotOnList(items, stillPlanned).length;
  if (missing > 0) {
    return (
      <WeekLine
        icon="shopping-basket"
        text={weekListLabel(missing)}
        action="Auf die Liste"
        onPress={props.onToList}
        testID="week-menu-to-list"
      />
    );
  }
  if (!offered || offered.planned.length + offered.picks.length === 0) return null;
  return (
    <WeekLine
      icon="lightbulb"
      text={weekLineLabel(free.length)}
      action="Was kochen wir?"
      onPress={props.onOpen}
      testID="week-menu-open"
    />
  );
}

const LATER = 'later';

/**
 * The Wochenkarte (REQ-009 to REQ-011): the free evenings as chips, "Vorgemerkt" and "Für euch
 * ausgesucht"; the bar shows where each chosen dish goes; one tap plans everything.
 */
export function WeekMenuSheet(props: {
  weekStart: ISODate;
  onClose: () => void;
  onPlanned: (entryIds: Id[]) => void;
}) {
  const online = useOnlineOnly();
  // On phones the bar ends the scrolling content; a short line in the fixed head shows the
  // distribution right away (REQ-010).
  const { isPhone } = useBreakpoint();
  const input = useSuggestionInput();
  const slot = lastSlotOf(input.slots);
  const slotId = slot?.id ?? '';
  const week = weekDates(props.weekStart);
  const free = freeEvenings(input.entries, week, slotId, input.today);
  // Taken meanwhile on another device: the chip goes and a sentence says so (REQ-009).
  const [atOpen] = useState(free);
  const gone = atOpen.filter((date) => !free.includes(date));
  const [off, setOff] = useState<ISODate[]>([]);
  const [chosen, setChosen] = useState<Id[]>([]);
  const [pages, setPages] = useState(1);
  const [pinned, setPinned] = useState<Record<Id, ISODate | null>>({});
  const [editing, setEditing] = useState(false);

  // The card is chosen for every free evening; a chip taken out only changes the distribution.
  const menu = weekMenu(input, eveningsOf(free, slotId), pages);
  const shown = [...menu.planned, ...menu.picks];
  const chosenDishes = shown.filter((dish) => chosen.includes(dish.recipe.id));
  const evenings = eveningsOf(
    free.filter((date) => !off.includes(date)),
    slotId,
  );
  const assignments = distributeWeek(input, chosenDishes, evenings, pinned);
  const leftFree = evenings
    .map((evening) => evening.date)
    .filter((date) => !assignments.some((row) => row.date === date));

  const toggleDish = (id: Id) => {
    setChosen(chosen.includes(id) ? chosen.filter((other) => other !== id) : [...chosen, id]);
    setPinned(Object.fromEntries(Object.entries(pinned).filter(([other]) => other !== id)));
  };
  const toggleEvening = (date: ISODate) =>
    setOff(off.includes(date) ? off.filter((other) => other !== date) : [...off, date]);
  const pin = (id: Id, value: string) => {
    const date = value === LATER ? null : value;
    // One dish per evening: whoever stood there is placed again.
    const rest = Object.fromEntries(
      Object.entries(pinned).filter(([other, day]) => other !== id && day !== date),
    );
    setPinned({ ...rest, [id]: date });
  };

  const save = () => {
    if (online.disabled || assignments.length === 0) return;
    const restore = snapshot();
    let planned: Id[];
    try {
      planned = planSuggested(
        assignments.map((row) => ({
          recipeId: row.suggestion.recipe.id,
          date: row.date,
          plannedLaterEntryId: row.suggestion.plannedLaterEntryId,
        })),
        slotId,
      );
    } catch (caught) {
      toast.show({
        message:
          caught instanceof OfflineError ? OFFLINE_EDIT_HINT : errorMessage(caught, FAILED_MESSAGE),
      });
      return;
    }
    props.onPlanned(planned);
    props.onClose();
    toast.show({
      message: weekPlannedNotice(assignments),
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };

  const dishRow = (dish: PlanSuggestion) => {
    const checked = chosen.includes(dish.recipe.id);
    return (
      <SuggestionRow
        key={dish.recipe.id}
        suggestion={dish}
        checked={checked}
        onPress={() => toggleDish(dish.recipe.id)}
        trailing={<CheckboxMark checked={checked} />}
        testID={`week-menu-dish-${dish.recipe.id}`}
      />
    );
  };

  const dayOptions = (dish: PlanSuggestion): MenuOption<string>[] => [
    ...evenings
      .filter((evening) => dish.fits.includes(evening.date))
      .map((evening) => ({
        value: evening.date,
        label: `${weekdayShort(evening.date)} ${formatShortDate(evening.date)}`,
      })),
    { value: LATER, label: 'Vormerken' },
  ];

  const bar =
    assignments.length === 0 ? (
      <Text variant="small" color="muted" testID="week-menu-bar-empty">
        Tipp an, worauf ihr Lust habt – die App verteilt es auf die Abende.
      </Text>
    ) : (
      <View testID="week-menu-bar" style={{ gap: 2 }}>
        {assignments.map((row) => {
          const day = row.date === null ? 'Vormerken' : weekdayShort(row.date);
          const note =
            row.date === null
              ? undefined
              : assignmentPrepNote(row.suggestion.recipe, row.date, slot?.name ?? '');
          return (
            <View
              key={row.suggestion.recipe.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 }}
              testID={`week-menu-bar-${row.suggestion.recipe.id}`}
            >
              {editing ? (
                <Menu<string>
                  label={day}
                  accessibilityLabel={`${row.suggestion.recipe.title}: ${day}`}
                  options={dayOptions(row.suggestion)}
                  value={row.date ?? LATER}
                  onChange={(value) => pin(row.suggestion.recipe.id, value)}
                  testID={`week-menu-day-${row.suggestion.recipe.id}`}
                />
              ) : (
                <Text variant="smallStrong" style={{ minWidth: 72 }}>
                  {day}
                </Text>
              )}
              <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
                {row.suggestion.recipe.title}
                {note ? <Text variant="small" color="muted">{` · ${note}`}</Text> : null}
              </Text>
            </View>
          );
        })}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {leftFree.length > 0 ? (
            <Text variant="small" color="muted">
              {`${leftFree.map(weekdayShort).join(', ')} ${leftFree.length === 1 ? 'bleibt' : 'bleiben'} frei`}
            </Text>
          ) : null}
          <Button
            label={editing ? 'Fertig' : 'Verteilung ändern'}
            variant="link"
            size="sm"
            onPress={() => setEditing(!editing)}
            testID="week-menu-edit"
          />
        </View>
      </View>
    );

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title="Was kochen wir?"
      size="l"
      testID="week-menu-sheet"
      header={
        <View style={{ gap: 8, paddingTop: 2 }}>
          <Text variant="small" color="muted">
            {`${weekLineLabel(free.length)} · antippen, was ihr essen wollt`}
          </Text>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
            testID="week-menu-evenings"
          >
            {free.map((date) => (
              <Chip
                key={date}
                label={weekdayShort(date)}
                detail={formatShortDate(date)}
                selected={!off.includes(date)}
                onPress={() => toggleEvening(date)}
                accessibilityLabel={`${weekdayShort(date)} ${formatShortDate(date)}`}
                testID={`week-menu-evening-${date}`}
              />
            ))}
          </View>
          {isPhone && assignments.length > 0 ? (
            <Text variant="small" testID="week-menu-summary">
              {assignments
                .map(
                  (row) =>
                    `${row.date === null ? 'vormerken' : weekdayShort(row.date)} ${row.suggestion.recipe.title}`,
                )
                .join(' · ')}
            </Text>
          ) : null}
          {gone.length > 0 ? (
            <Text variant="small" color="warn" testID="week-menu-gone">
              {`${gone.map(weekdayShort).join(', ')} ${gone.length === 1 ? 'ist' : 'sind'} inzwischen belegt`}
            </Text>
          ) : null}
        </View>
      }
      footer={bar}
      actions={{
        primary: {
          label: weekPlanLabel(assignments),
          icon: 'plus',
          disabled: online.disabled || assignments.length === 0,
          hint: online.disabled
            ? online.offline
              ? PLAN_ONLINE_HINT
              : online.hint
            : assignments.length === 0
              ? 'Tipp an, worauf ihr Lust habt.'
              : undefined,
          testID: 'week-menu-save',
          onPress: save,
        },
      }}
    >
      {shown.length === 0 ? (
        <Text color="muted" testID="week-menu-empty">
          Für diese Abende passt gerade nichts.
        </Text>
      ) : null}
      {menu.planned.length > 0 ? (
        <>
          <GroupLabel>Vorgemerkt</GroupLabel>
          <List testID="week-menu-planned">{menu.planned.map(dishRow)}</List>
        </>
      ) : null}
      {menu.picks.length > 0 ? (
        <>
          <GroupLabel>Für euch ausgesucht</GroupLabel>
          <List testID="week-menu-picks">{menu.picks.map(dishRow)}</List>
          {menu.more ? (
            <Button
              label="Mehr"
              icon="chevron-down"
              variant="link"
              size="sm"
              onPress={() => setPages(pages + 1)}
              testID="week-menu-more"
            />
          ) : null}
        </>
      ) : null}
      {menu.fresh ? <FreshHint /> : null}
    </Sheet>
  );
}
