import {
  formatPickerDate,
  monthPickerStart,
  REPEAT_OPTIONS,
  repeatRule,
  seriesDraftProblem,
  seriesRuleLabel,
  weekdayShortName,
  type ISODate,
  type RepeatDraft,
  type RepeatKind,
} from '@housekeeping/core';
import { Chip, ChoiceChips, IconButton, Stack, Text } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { PlanDateCalendar } from '@/lib/plan-date-calendar';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const MAX_WEEKS = 52;
const MAX_MONTH_DAY = 31;

type EndChoice = 'forever' | 'until';

/** − n + with a word: "alle 2 Wochen", "am 15.". */
function Counter(props: {
  text: string;
  value: number;
  min: number;
  max: number;
  less: string;
  more: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  testID: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <IconButton
        icon="minus"
        label={props.less}
        disabled={props.disabled || props.value <= props.min}
        onPress={() => props.onChange(Math.max(props.min, props.value - 1))}
        testID={`${props.testID}-minus`}
      />
      <Text variant="smallStrong" testID={props.testID}>
        {props.text}
      </Text>
      <IconButton
        icon="plus"
        label={props.more}
        disabled={props.disabled || props.value >= props.max}
        onPress={() => props.onChange(Math.min(props.max, props.value + 1))}
        testID={`${props.testID}-plus`}
      />
    </View>
  );
}

/**
 * "Rhythmus" of an activity (spec 0041, REQ-003): einmalig, wöchentlich (Wochentage, alle N
 * Wochen), monatlich (am Tag X) or jährlich (am Datum des Starts), and "Ende": dauerhaft or bis
 * a day. `startsOn` is the first day; `fixedKind` hides "Einmalig" (Serie bearbeiten).
 */
export function RepeatFields(props: {
  value: RepeatDraft;
  onChange: (next: RepeatDraft) => void;
  startsOn: ISODate;
  today: ISODate;
  /** "Serie bearbeiten": a series stays a series. */
  withoutOnce?: boolean;
  /** Only these kinds (a Dauerposten: weekly and monthly, spec 0060). */
  kinds?: readonly RepeatKind[];
  /** No "Ende" and no summary: a Dauerposten is paused instead (spec 0060). */
  withoutEnd?: boolean;
  disabled?: boolean;
}) {
  const { value, onChange } = props;
  const [picking, setPicking] = useState(false);
  const rule = repeatRule(value);
  const problem = rule
    ? seriesDraftProblem({ rule, startsOn: props.startsOn, endsOn: value.until })
    : undefined;
  const options = REPEAT_OPTIONS.filter(
    (option) =>
      !(props.withoutOnce && option.value === 'none') &&
      (props.kinds === undefined || props.kinds.includes(option.value)),
  );
  const end: EndChoice = value.until === undefined ? 'forever' : 'until';

  return (
    <Stack gap={12}>
      <Text variant="smallStrong">Rhythmus</Text>
      <ChoiceChips<RepeatKind>
        label="Rhythmus"
        options={[...options]}
        value={value.kind}
        onChange={(kind) => onChange({ ...value, kind })}
        disabled={props.disabled}
        testID="repeat-kind"
      />
      {value.kind === 'weekly' ? (
        <Stack gap={8}>
          <View
            accessibilityRole="none"
            accessibilityLabel="Wochentage"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
          >
            {WEEKDAYS.map((weekday) => {
              const selected = value.weekdays.includes(weekday);
              return (
                <Chip
                  key={weekday}
                  label={weekdayShortName(weekday)}
                  selected={selected}
                  disabled={props.disabled}
                  onPress={() =>
                    onChange({
                      ...value,
                      weekdays: selected
                        ? value.weekdays.filter((day) => day !== weekday)
                        : [...value.weekdays, weekday],
                    })
                  }
                  testID={`repeat-weekday-${weekday}`}
                />
              );
            })}
          </View>
          <Counter
            text={value.every === 1 ? 'jede Woche' : `alle ${value.every} Wochen`}
            value={value.every}
            min={1}
            max={MAX_WEEKS}
            less="Öfter"
            more="Seltener"
            disabled={props.disabled}
            onChange={(every) => onChange({ ...value, every })}
            testID="repeat-every"
          />
        </Stack>
      ) : null}
      {value.kind === 'monthly' ? (
        <Counter
          text={`am ${value.monthDay}.`}
          value={value.monthDay}
          min={1}
          max={MAX_MONTH_DAY}
          less="Ein Tag früher"
          more="Ein Tag später"
          disabled={props.disabled}
          onChange={(monthDay) => onChange({ ...value, monthDay })}
          testID="repeat-month-day"
        />
      ) : null}
      {rule && !props.withoutEnd ? (
        <Text variant="small" color="muted" testID="repeat-summary">
          {`${seriesRuleLabel(rule, props.startsOn)}, ab ${formatPickerDate(props.startsOn)}`}
        </Text>
      ) : null}
      {value.kind !== 'none' && !props.withoutEnd ? (
        <Stack gap={8}>
          <Text variant="smallStrong">Ende</Text>
          <ChoiceChips<EndChoice>
            label="Ende"
            options={[
              { value: 'forever', label: 'Dauerhaft' },
              {
                value: 'until',
                label: value.until ? `Bis ${formatPickerDate(value.until)}` : 'Bis …',
              },
            ]}
            value={end}
            onChange={(next) => {
              if (next === 'forever') {
                setPicking(false);
                onChange({ ...value, until: undefined });
              } else setPicking(true);
            }}
            disabled={props.disabled}
            testID="repeat-end"
          />
          {picking ? (
            <PlanDateCalendar
              month={monthPickerStart(value.until ?? null, props.startsOn)}
              today={props.today}
              marked={value.until ?? null}
              isDisabled={(date) => date < props.startsOn}
              onSelect={(date) => {
                onChange({ ...value, until: date });
                setPicking(false);
              }}
              testID="repeat-until"
            />
          ) : null}
        </Stack>
      ) : null}
      {problem ? (
        <Text variant="small" color="warn" testID="repeat-problem">
          {problem}
        </Text>
      ) : null}
    </Stack>
  );
}
