import {
  splitForEaters,
  useHousehold,
  useMembers,
  useMembersById,
  useToday,
  useTrips,
} from '@housekeeping/api';
import {
  defaultPlanChoice,
  pagePlanChoice,
  planButtonLabel,
  plannedNotice,
  planWeek,
  refreshPlanEaters,
  weekdayShort,
  weekDays,
  weekOffsetFor,
  withPlanDay,
  type PlanChoice,
  type PlanEntryVariant,
  type Recipe,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  ChoiceChips,
  IconButton,
  Row,
  Sheet,
  Stack,
  Text,
  toast,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { PlanDateCalendar } from '@/features/calendar/plan-date-calendar';
import { useOnlineOnly } from '@/features/shell/offline';

import { CookPicker, EaterPicker, FieldLabel, SplitFields } from './plan-fields';

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Das hat nicht geklappt.';

/** What "Wer isst mit?" means for a recipe or a collection: portions over its variants. */
export interface PlanSplit {
  portions: number;
  variants: PlanEntryVariant[];
}

/**
 * The one window "Einplanen" (spec 0023, REQ-013, Decision 14) for recipes and collections, later
 * also restaurants and activities (spec 0024): the week (‹ › without limit) with day chips "Mi"
 * over "25.11.", "Ohne Tag vormerken", "Anderes Datum …" (a month calendar in the window), the
 * Tageszeit, "Wer isst mit?", for a recipe the split over its variants, and "Wer kocht?". It opens
 * on today and the last Tageszeit; while "Wer isst mit?" is untouched the preselection follows
 * members and trips arriving later. Afterwards the page stays and a notice offers "Ansehen".
 */
export function PlanSheet(props: {
  /** The name of what is planned, shown on top. */
  title: string;
  /** A recipe or a collection: the split over its variants and the cook. */
  recipe?: Recipe;
  /** More fields under the Tageszeit: "Uhrzeit (optional)" and "Zusatz" (spec 0024). */
  extra?: ReactNode;
  /** Adds the entry; a thrown error is shown in the window. */
  onPlan: (choice: PlanChoice, split: PlanSplit | undefined) => void;
  onClose: () => void;
}) {
  const { recipe } = props;
  const router = useRouter();
  const online = useOnlineOnly();
  const today = useToday();
  const household = useHousehold();
  const members = useMembers();
  const membersById = useMembersById();
  const trips = useTrips();
  const slots = [...household.mealSlots].sort((a, b) => a.sort - b.sort);

  const [weekOffset, setWeekOffset] = useState(0);
  const [choice, setChoice] = useState<PlanChoice>(() =>
    defaultPlanChoice(today, household.mealSlots, members, trips),
  );
  // AC-055, AC-056: members or trips that arrive later count while the eaters are untouched.
  const [touched, setTouched] = useState(false);
  const [seen, setSeen] = useState({ members, trips });
  if (seen.members !== members || seen.trips !== trips) {
    setSeen({ members, trips });
    setChoice(refreshPlanEaters(choice, touched, members, trips));
  }
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const week = planWeek(today, weekOffset);
  const days = weekDays(week.start);
  const slotName = slots.find((slot) => slot.id === choice.slotId)?.name ?? '';
  const split = recipe ? splitForEaters(recipe.id, choice.eaterIds, choice.guests) : undefined;
  const misfits = split ? split.misfitMemberIds.flatMap((id) => membersById[id] ?? []) : [];
  const noEaters = choice.eaterIds.length + choice.guests === 0;

  const update = (next: PlanChoice) => {
    setChoice(next);
    setError(undefined);
  };
  // Another day sets "Wer isst mit?" back to those present (E11): untouched again.
  const toDay = (date: string | null) => {
    setTouched(false);
    update(withPlanDay(choice, date, members, trips));
  };
  const page = (weeks: number) => {
    setWeekOffset(weekOffset + weeks);
    setTouched(false);
    update(pagePlanChoice(choice, weeks, members, trips));
  };
  const toggleLater = () => {
    if (choice.date !== null) {
      toDay(null);
      return;
    }
    // Back to a day: today's weekday in the week on screen.
    const day = days.find((candidate) => candidate.label === weekdayShort(today)) ?? days[0];
    if (day) toDay(day.date);
  };
  // "Anderes Datum …" (AC-054): the tapped day is chosen and its week shown.
  const pickDate = (date: string) => {
    setPicking(false);
    setWeekOffset(weekOffsetFor(today, date));
    toDay(date);
  };

  const save = () => {
    if (online.disabled || noEaters || !choice.slotId) return;
    const { date } = choice;
    try {
      props.onPlan(
        choice,
        split ? { portions: split.portions, variants: split.variants } : undefined,
      );
    } catch (caught) {
      setError(message(caught));
      return;
    }
    props.onClose();
    toast.show({
      message: plannedNotice(date, slotName),
      actionLabel: 'Ansehen',
      // AC-035: the calendar opens the week of that day; "Vorgemerkt" opens the calendar.
      onAction: () =>
        router.navigate(date ? { pathname: '/kalender', params: { tag: date } } : '/kalender'),
    });
  };

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title="Einplanen"
      size="m"
      testID="plan-recipe-sheet"
      footer={
        <Button
          label={planButtonLabel(choice.date, slotName)}
          icon="calendar-plus"
          full
          disabled={online.disabled || noEaters || !choice.slotId}
          hint={
            online.hint ??
            (noEaters
              ? 'Wähl aus, wer mitisst.'
              : choice.slotId
                ? undefined
                : 'Lege zuerst eine Tageszeit an.')
          }
          onPress={save}
          testID="plan-recipe-save"
        />
      }
    >
      <Stack gap={18}>
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        <Text variant="cardTitle" numberOfLines={2} testID="plan-recipe-title">
          {props.title}
        </Text>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <IconButton
              icon="chevron-left"
              label="Woche davor"
              onPress={() => page(-1)}
              testID="plan-recipe-week-prev"
            />
            <Text variant="bodyStrong" align="center" style={{ flex: 1 }} testID="plan-recipe-week">
              {week.label}
            </Text>
            <IconButton
              icon="chevron-right"
              label="Woche danach"
              onPress={() => page(1)}
              testID="plan-recipe-week-next"
            />
          </View>
          <ChoiceChips
            label="Tag"
            options={days.map((day) => ({ value: day.date, label: day.label, detail: day.detail }))}
            // No day is chosen while "Ohne Tag vormerken" is on.
            value={choice.date ?? ''}
            onChange={toDay}
            testID="plan-recipe-day"
          />
          <Row gap={8} wrap>
            <Chip
              label="Ohne Tag vormerken"
              icon="bookmark"
              selected={choice.date === null}
              onPress={toggleLater}
              testID="plan-recipe-later"
            />
            <Chip
              label="Anderes Datum …"
              icon="calendar-days"
              selected={picking}
              onPress={() => setPicking(!picking)}
              testID="plan-recipe-other-date"
            />
          </Row>
          {picking ? (
            <PlanDateCalendar
              month={week.start}
              today={today}
              marked={choice.date}
              onSelect={pickDate}
              testID="plan-recipe-calendar"
            />
          ) : null}
        </View>
        {slots.length > 0 ? (
          <View>
            <FieldLabel>Tageszeit</FieldLabel>
            <ChoiceChips
              label="Tageszeit"
              options={slots.map((slot) => ({ value: slot.id, label: slot.name }))}
              value={choice.slotId ?? ''}
              onChange={(slotId) => update({ ...choice, slotId })}
              testID="plan-recipe-slot"
            />
          </View>
        ) : null}
        {props.extra}
        <EaterPicker
          members={members}
          eaterIds={choice.eaterIds}
          guests={choice.guests}
          onEaters={(eaterIds) => {
            setTouched(true);
            update({ ...choice, eaterIds });
          }}
          onGuests={(guests) => {
            setTouched(true);
            update({ ...choice, guests });
          }}
        />
        {recipe && split ? (
          <SplitFields recipe={recipe} split={split} misfits={misfits} testID="plan-recipe" />
        ) : null}
        {recipe ? (
          <CookPicker
            members={members}
            cookId={choice.cookId}
            onChange={(cookId) => update({ ...choice, cookId })}
          />
        ) : null}
        {error ? (
          <Text variant="small" color="warn" testID="plan-recipe-error">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Sheet>
  );
}
