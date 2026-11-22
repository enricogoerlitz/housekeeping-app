import {
  setEntryReminder,
  useHousehold,
  useNotificationSettings,
  WRITE_REJECTED_MESSAGE,
} from '@housekeeping/api';
import {
  asksForPushPermission,
  householdClock,
  MAX_REMINDER_TEXT,
  monthPickerStart,
  offsetFor,
  REMINDER_OFF_DRAFT,
  reminderDay,
  reminderDayChoices,
  reminderDraftFrom,
  reminderReachHint,
  reminderSave,
  reminderTextCounter,
  selectableReminderDays,
  switchedOnDraft,
  thisDeviceRegistered,
  type EntryReminder,
  type Id,
  type ISODate,
  type ReminderDraft,
  type ReminderSave,
} from '@housekeeping/core';
import { Button, Chip, Stack, SwitchRow, Text, TextField, TimeField } from '@housekeeping/ui';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { PlanDateCalendar } from '@/features/calendar/plan-date-calendar';
import { loadDevicePushState, useDevicePushState } from '@/features/notifications/device-store';
import { useEnsureDevicePush } from '@/features/notifications/use-device-push';
import { devicePushSupport } from '@/features/notifications/web-push-platform';

import { FieldLabel } from './plan-fields';
import { entryReminderLabels, ReminderBell } from './reminder-bell';

// Spec 0017 "Erinnern" (REQ-001 to REQ-004, REQ-007): the switch and, when it is on, "Tag",
// "Uhrzeit" and "Woran erinnern? (optional)". The add window keeps the draft until "Einplanen";
// the entry window sends switch, chips and time right away and the text with Enter, leaving the
// field and "Fertig" (REQ-002). The checks come from core (`reminderSave`).

type FieldError = { field: 'day' | 'time' | 'text'; error: string };

export interface ReminderForm {
  entryDate: ISODate;
  draft: ReminderDraft;
  error: FieldError | undefined;
  /** The stored reminder of the entry window, for "Erinnerung Fr 18:00". */
  stored: EntryReminder | undefined;
  toggle: (on: boolean) => void;
  chooseDay: (offsetDays: number) => void;
  setTime: (text: string) => void;
  clearTime: () => void;
  commitTime: () => void;
  setText: (text: string) => void;
  commitText: () => void;
  /** "Einplanen" in the add window: what the draft means; an invalid one shows its hint. */
  check: () => ReminderSave;
  /** "Fertig" in the entry window: sends what is pending; false when a hint is shown instead. */
  save: () => boolean;
  /** Resolves once the server took what was sent last, rejects when it refused it. */
  pending: () => Promise<void>;
}

/**
 * The draft of "Erinnern". With `entryId` (the entry window) every change of switch, day and time
 * is sent at once; without it (the add window) nothing leaves the window before "Einplanen".
 */
export function useReminderForm(options: {
  entryDate: ISODate;
  slotName: string;
  stored?: EntryReminder;
  entryId?: Id;
}): ReminderForm {
  const { entryDate, entryId } = options;
  const household = useHousehold();
  const ensureDevicePush = useEnsureDevicePush();
  const [draft, setDraft] = useState<ReminderDraft>(() => reminderDraftFrom(options.stored));
  const [error, setError] = useState<FieldError>();
  // What the server has or was sent last: blur and "Fertig" come before the next render. A new
  // value from the cache (sent, sprung back after a refusal, changed elsewhere) replaces it.
  const base = useRef(options.stored);
  useEffect(() => {
    base.current = options.stored;
  }, [options.stored]);
  const sent = useRef<Promise<void>>(Promise.resolve());

  const decide = (next: ReminderDraft): ReminderSave =>
    reminderSave({
      entryDate,
      stored: base.current,
      draft: next,
      now: new Date(),
      timeZone: household.timeZone,
    });

  /**
   * Checks `next` and shows the hint of its field; the entry window also sends it. False when the
   * hint is shown instead.
   */
  const send = (next: ReminderDraft, how?: { quietWithoutTime?: boolean }): boolean => {
    // Switched on or a chip chosen before a time is typed: it waits for the time (REQ-003).
    if (how?.quietWithoutTime && next.on && next.time.trim() === '') return true;
    const decision = decide(next);
    if (decision.action === 'invalid') {
      setError({ field: decision.field, error: decision.error });
      return false;
    }
    if (entryId === undefined || decision.action === 'keep') return true;
    const reminder = decision.action === 'set' ? decision.reminder : null;
    try {
      sent.current = setEntryReminder(entryId, reminder);
    } catch (caught) {
      setError({
        field: 'time',
        error: caught instanceof Error ? caught.message : WRITE_REJECTED_MESSAGE,
      });
      return false;
    }
    base.current = reminder ?? undefined;
    // The hint of a refusal comes from onWriteRejected; only "Fertig" waits for it.
    sent.current.catch(() => {});
    return true;
  };

  const update = (next: ReminderDraft) => {
    setDraft(next);
    setError(undefined);
  };

  return {
    entryDate,
    draft,
    error,
    stored: options.stored,
    toggle: (on) => {
      // The browser's question first, inside the tap (spec 0013, AC-007; AC-026).
      if (asksForPushPermission({ kind: 'switch', on })) ensureDevicePush();
      const next = on
        ? switchedOnDraft(entryDate, options.slotName, new Date(), household.timeZone)
        : REMINDER_OFF_DRAFT;
      update(next);
      send(next, { quietWithoutTime: true });
    },
    chooseDay: (offsetDays) => {
      const next = { ...draft, offsetDays };
      update(next);
      send(next, { quietWithoutTime: true });
    },
    setTime: (time) => {
      setDraft({ ...draft, time });
      if (error?.field === 'time') setError(undefined);
    },
    clearTime: () => {
      setDraft({ ...draft, time: '' });
      if (error?.field === 'time') setError(undefined);
    },
    commitTime: () => {
      send(draft);
    },
    setText: (text) => {
      setDraft({ ...draft, text });
      if (error?.field === 'text') setError(undefined);
    },
    commitText: () => {
      send(draft);
    },
    check: () => {
      const decision = decide(draft);
      if (decision.action === 'invalid') setError({ field: decision.field, error: decision.error });
      return decision;
    },
    save: () => send(draft),
    pending: () => sent.current,
  };
}

/** Whether this device shows notifications, from what it remembers (works offline). */
function useDeviceRegistered(): boolean {
  const device = useDevicePushState();
  useEffect(() => {
    void loadDevicePushState();
  }, []);
  return thisDeviceRegistered({
    support: devicePushSupport(),
    wanted: device.wanted,
    ...(device.endpoint ? { storedEndpoint: device.endpoint } : {}),
  });
}

/**
 * The block "Erinnern" in the add window and the entry window. Offline everything is greyed out
 * with `hint` (ADR-0008). `onOpenSettings` closes the window and opens "Benachrichtigungen".
 */
export function ReminderBlock(props: {
  form: ReminderForm;
  disabled: boolean;
  hint: string | undefined;
  onOpenSettings: () => void;
  /** The entry's name for the bell's screen-reader text, "Lasagne, Erinnerung Freitag 18 Uhr". */
  entryTitle?: string;
  testID: string;
}) {
  const { form, disabled, testID } = props;
  const { draft, entryDate } = form;
  const household = useHousehold();
  const settings = useNotificationSettings();
  const deviceRegistered = useDeviceRegistered();
  const [picking, setPicking] = useState(false);
  const now = new Date();
  const today = householdClock(now, household.timeZone).date;
  const range = selectableReminderDays(entryDate, today);
  const chips = reminderDayChoices(entryDate, draft.on ? draft.offsetDays : undefined, today);
  const reach = reminderReachHint({
    kindEnabled: settings?.entryRemindersEnabled ?? true,
    deviceRegistered,
  });
  const bell = form.stored
    ? entryReminderLabels(
        { date: entryDate, reminder: form.stored },
        props.entryTitle ?? '',
        household.timeZone,
        now,
      )
    : undefined;
  const fieldError = (field: FieldError['field']) =>
    form.error?.field === field ? form.error.error : undefined;

  const chooseChip = (key: (typeof chips)[number]['key']) => {
    if (key === 'otherDate') {
      setPicking(!picking);
      return;
    }
    setPicking(false);
    form.chooseDay(key === 'sameDay' ? 0 : 1);
  };

  return (
    <View style={{ gap: 16 }} testID={testID}>
      <Stack gap={4}>
        <SwitchRow
          label="Erinnern"
          value={draft.on}
          onValueChange={(on) => {
            setPicking(false);
            form.toggle(on);
          }}
          disabled={disabled}
          testID={`${testID}-switch`}
        />
        {bell ? (
          <ReminderBell
            label={bell.label}
            accessibilityLabel={props.entryTitle ? bell.accessibilityLabel : bell.label}
            size="row"
            testID={`${testID}-bell`}
          />
        ) : null}
        {draft.on && reach ? (
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}
            testID={`${testID}-reach`}
          >
            <Text variant="small" color="muted">
              {reach}
            </Text>
            <Button
              label="Benachrichtigungen"
              variant="link"
              size="sm"
              onPress={props.onOpenSettings}
              testID={`${testID}-settings`}
            />
          </View>
        ) : null}
      </Stack>
      {draft.on ? (
        <>
          <View>
            <FieldLabel>Tag</FieldLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {chips.map((chip) => (
                <Chip
                  key={chip.key}
                  label={chip.label}
                  icon={chip.key === 'otherDate' ? 'calendar-days' : undefined}
                  selected={chip.selected || (chip.key === 'otherDate' && picking)}
                  disabled={disabled || chip.disabled}
                  hint={
                    disabled ? props.hint : chip.disabled ? 'Liegt in der Vergangenheit' : undefined
                  }
                  onPress={() => chooseChip(chip.key)}
                  testID={`${testID}-day-${chip.key}`}
                />
              ))}
            </View>
            {picking && range ? (
              <View style={{ marginTop: 12 }}>
                <PlanDateCalendar
                  month={monthPickerStart(reminderDay(entryDate, draft.offsetDays), today)}
                  today={today}
                  marked={reminderDay(entryDate, draft.offsetDays)}
                  isDisabled={(date) => disabled || date < range.from || date > range.to}
                  onSelect={(date) => {
                    setPicking(false);
                    form.chooseDay(offsetFor(entryDate, date));
                  }}
                  testID={`${testID}-date`}
                />
              </View>
            ) : null}
            {fieldError('day') ? (
              <Text variant="small" color="warn" style={{ marginTop: 6 }}>
                {fieldError('day')}
              </Text>
            ) : null}
          </View>
          <TimeField
            label="Uhrzeit"
            placeholder="z. B. 17:00"
            value={draft.time}
            onChangeText={form.setTime}
            onBlur={() => {
              if (!disabled) form.commitTime();
            }}
            onSubmitEditing={() => {
              if (!disabled) form.commitTime();
            }}
            onClear={form.clearTime}
            clearLabel="Uhrzeit leeren"
            emptyLabel="keine Uhrzeit"
            error={fieldError('time')}
            hint={disabled ? props.hint : undefined}
            disabled={disabled}
            testID={`${testID}-time`}
          />
          <TextField
            label="Woran erinnern? (optional)"
            value={draft.text}
            onChangeText={form.setText}
            onBlur={() => {
              if (!disabled) form.commitText();
            }}
            onSubmitEditing={() => {
              if (!disabled) form.commitText();
            }}
            placeholder="z. B. Fleisch auftauen"
            maxLength={MAX_REMINDER_TEXT}
            returnKeyType="done"
            editable={!disabled}
            error={fieldError('text')}
            hint={reminderTextCounter(draft.text)}
            testID={`${testID}-text`}
          />
        </>
      ) : null}
    </View>
  );
}
