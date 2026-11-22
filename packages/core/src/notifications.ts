import { z } from 'zod';

import { parseISODate, toISODate } from './dates';
import type {
  DailySummaryPart,
  Id,
  ISODate,
  NotificationSettings,
  OwnPushSubscription,
  RemindMinutes,
  TimeOfDay,
} from './types';

// Spec 0013 "Benachrichtigungen": the rules of the page, times, the state of this device and the
// targets of a tap. The scheduler builds the texts of the notifications in SQL (ADR-0014); only
// the page and the forms use what is here.

// ---------- Kinds and settings ----------

export type NotificationKind =
  'dailySummary' | 'activitiesEve' | 'choreReminders' | 'reservationReminders' | 'entryReminders';

/** In the order of the page (concept 3.14). */
export const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'dailySummary',
  'activitiesEve',
  'choreReminders',
  'reservationReminders',
  'entryReminders',
];

const ENABLED_FIELD = {
  dailySummary: 'dailySummaryEnabled',
  activitiesEve: 'activitiesEveEnabled',
  choreReminders: 'choreRemindersEnabled',
  reservationReminders: 'reservationRemindersEnabled',
  entryReminders: 'entryRemindersEnabled',
} as const satisfies Record<NotificationKind, keyof NotificationSettings>;

export function kindEnabled(settings: NotificationSettings, kind: NotificationKind): boolean {
  return settings[ENABLED_FIELD[kind]];
}

/** The patch that switches one kind; nothing else changes (AC-008: no device is touched). */
export function kindEnabledPatch(
  kind: NotificationKind,
  enabled: boolean,
): Partial<NotificationSettings> {
  return { [ENABLED_FIELD[kind]]: enabled };
}

/** The row in the settings: "Benachrichtigungen · 2 an" (AC-001). */
export function enabledKindsLabel(settings: NotificationSettings): string {
  const count = NOTIFICATION_KINDS.filter((kind) => kindEnabled(settings, kind)).length;
  return count === 0 ? 'Alle aus' : `${count} an`;
}

/**
 * The same row naming this device (spec 0018, AC-022): "2 an · dieses Gerät aus" while kinds are
 * on but nothing reaches this device; "2 an" once it is registered.
 */
export function notificationsRowLabel(settings: NotificationSettings, deviceOn: boolean): string {
  const kinds = enabledKindsLabel(settings);
  const anyOn = NOTIFICATION_KINDS.some((kind) => kindEnabled(settings, kind));
  return anyOn && !deviceOn ? `${kinds} · dieses Gerät aus` : kinds;
}

/**
 * Whether this device is registered for notifications, from what it remembers itself (works
 * offline): switched on here, with a push address registered, where push is supported.
 */
export function thisDeviceRegistered(
  state: Pick<DeviceState, 'support' | 'wanted' | 'storedEndpoint'>,
): boolean {
  return state.support === 'supported' && state.wanted === true && !!state.storedEndpoint;
}

/** The fixed order of the parts, also in the notification itself. */
export const DAILY_SUMMARY_PARTS: readonly DailySummaryPart[] = [
  'meals',
  'activities',
  'chores',
  'prep',
];

const PART_LABELS: Record<DailySummaryPart, string> = {
  meals: 'Essen',
  activities: 'Aktivitäten',
  chores: 'Aufgaben',
  prep: 'Vorbereitung',
};

export function dailySummaryPartLabel(part: DailySummaryPart): string {
  return PART_LABELS[part];
}

/** The last chosen part cannot be deselected: at least one part (Decision 25). */
export function isLastSummaryPart(parts: readonly DailySummaryPart[], part: DailySummaryPart) {
  return parts.length === 1 && parts[0] === part;
}

/** Chooses or drops one part; the result is in the fixed order. */
export function toggleSummaryPart(
  parts: readonly DailySummaryPart[],
  part: DailySummaryPart,
): DailySummaryPart[] {
  if (isLastSummaryPart(parts, part)) return [...parts];
  const chosen = new Set(parts);
  if (chosen.has(part)) chosen.delete(part);
  else chosen.add(part);
  return DAILY_SUMMARY_PARTS.filter((each) => chosen.has(each));
}

/**
 * The line under a kind (AC-011): "7:30 · Essen · Aktivitäten · Aufgaben · Vorbereitung",
 * "19:00", "2 h vorher, je Eintrag änderbar"; chores with a time have none.
 */
export function kindSubtitle(
  settings: NotificationSettings,
  kind: NotificationKind,
): string | undefined {
  switch (kind) {
    case 'dailySummary': {
      const parts = DAILY_SUMMARY_PARTS.filter((part) =>
        settings.dailySummaryParts.includes(part),
      ).map(dailySummaryPartLabel);
      return [formatTime(settings.dailySummaryAt), ...parts].join(' · ');
    }
    case 'activitiesEve':
      return formatTime(settings.activitiesEveAt);
    case 'choreReminders':
    // Spec 0017, REQ-007: no time of its own; it is set per entry.
    case 'entryReminders':
      return undefined;
    case 'reservationReminders':
      return `${remindLabel(DEFAULT_REMIND_MINUTES)}, je Eintrag änderbar`;
  }
}

// ---------- Times ----------

export type TimeInputResult =
  { ok: true; time: TimeOfDay | undefined } | { ok: false; error: string };

const TIME_ERRORS = {
  invalid: 'Keine gültige Uhrzeit',
  step: 'Bitte in 5-Minuten-Schritten',
  required: 'Bitte eine Uhrzeit eingeben',
};

/** "19", "7", "1930", "730", "19:30", "7.30": hour alone, digits, or with ":" or ".". */
const TIME_INPUT = /^(?:(\d{1,2})|(\d{1,2})(\d{2})|(\d{1,2})[:.](\d{2}))$/;

/**
 * Reads a typed time (Decision 27). Empty means no time, unless one is required. Only full
 * five-minute steps count, as the scheduler runs every 5 minutes (Decision 4).
 */
export function parseTimeInput(input: string, options?: { required?: boolean }): TimeInputResult {
  const text = input.trim();
  if (text === '') {
    return options?.required
      ? { ok: false, error: TIME_ERRORS.required }
      : { ok: true, time: undefined };
  }
  const match = TIME_INPUT.exec(text);
  if (!match) return { ok: false, error: TIME_ERRORS.invalid };
  const hour = Number(match[1] ?? match[2] ?? match[4]);
  const minute = Number(match[3] ?? match[5] ?? 0);
  if (hour > 23 || minute > 59) return { ok: false, error: TIME_ERRORS.invalid };
  if (minute % 5 !== 0) return { ok: false, error: TIME_ERRORS.step };
  return {
    ok: true,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

/** "7:30", "19:00": like the texts of the scheduler (`H:MM`). */
export function formatTime(time: TimeOfDay): string {
  const [hour = '0', minute = '00'] = time.split(':');
  return `${Number(hour)}:${minute}`;
}

/** "Müll rausbringen · 19:00" in "Zu tun" and the household row (AC-022); no time, no change. */
export function withTime(title: string, time: TimeOfDay | undefined): string {
  return time === undefined ? title : `${title} · ${formatTime(time)}`;
}

/** Under "Uhrzeit" of a chore: whether the own setting reminds (AC-022, Offene Frage 3 d). */
export function choreTimeHint(choreRemindersEnabled: boolean): string {
  return choreRemindersEnabled
    ? 'Du wirst zur Uhrzeit erinnert („Aufgaben mit Uhrzeit“ ist an)'
    : 'Keine Erinnerung: „Aufgaben mit Uhrzeit“ ist in deinen Benachrichtigungen aus';
}

/** "Erinnern … vorher" of a reservation (Offene Frage 2 A, Decision 14). */
export const REMIND_CHOICES: readonly RemindMinutes[] = [30, 60, 120, 180, 240];
export const DEFAULT_REMIND_MINUTES: RemindMinutes = 120;

/** "30 Min vorher", "1 h vorher", "2 h vorher" (AC-029). */
export function remindLabel(minutes: RemindMinutes): string {
  return minutes < 60 ? `${minutes} Min vorher` : `${minutes / 60} h vorher`;
}

/**
 * What may ask the browser for its permission (AC-007, Decision 26): only an explicit gesture.
 * - `time`: a time saved with a tap ("Speichern", "Fertig") or Enter, when it is set and differs
 *   from `before` (the time last confirmed that way); leaving the field (blur) saves but never
 *   asks; removing a time never asks.
 * - `switch`: switching a kind on.
 * - `kindTime`: saving the time of a kind that is on.
 */
export type PushPermissionTrigger =
  | {
      kind: 'time';
      gesture: 'tap' | 'enter' | 'blur';
      before: TimeOfDay | undefined;
      after: TimeOfDay | undefined;
    }
  | { kind: 'switch'; on: boolean }
  | { kind: 'kindTime'; kindEnabled: boolean };

export function asksForPushPermission(trigger: PushPermissionTrigger): boolean {
  switch (trigger.kind) {
    case 'time':
      return (
        trigger.gesture !== 'blur' &&
        trigger.after !== undefined &&
        trigger.after !== trigger.before
      );
    case 'switch':
      return trigger.on;
    case 'kindTime':
      return trigger.kindEnabled;
  }
}

// ---------- This device ----------

/** What the browser offers for Web Push, read by the app (AC-006). */
export interface PushEnvironment {
  /** Runs in a browser; native builds have no Web Push (spec 0013, non-goal). */
  web: boolean;
  /** The development server has no service worker (Decision 24). */
  dev: boolean;
  /** iPhone or iPad, in any browser. */
  ios: boolean;
  /** An iPad (also one that reports itself as a Mac); its hint names the iPad. */
  ipad: boolean;
  /** Opened as an installed app (display-mode standalone). */
  standalone: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
}

export type PushSupport =
  | 'supported'
  | 'ios-needs-home-screen'
  | 'ipad-needs-home-screen'
  | 'unsupported'
  | 'dev-no-worker';

export function pushSupport(env: PushEnvironment): PushSupport {
  if (!env.web) return 'unsupported';
  // Safari in a tab has no PushManager at all; the home-screen app has (from iOS 16.4).
  if (env.ios && !env.standalone)
    return env.ipad ? 'ipad-needs-home-screen' : 'ios-needs-home-screen';
  if (env.dev) return 'dev-no-worker';
  return env.serviceWorker && env.pushManager && env.notification ? 'supported' : 'unsupported';
}

const SUPPORT_HINTS: Record<PushSupport, string | undefined> = {
  supported: undefined,
  'ios-needs-home-screen': 'Auf dem iPhone erst die App zum Home-Bildschirm hinzufügen',
  'ipad-needs-home-screen': 'Auf dem iPad erst die App zum Home-Bildschirm hinzufügen',
  unsupported: 'Dieser Browser kann keine Benachrichtigungen empfangen',
  'dev-no-worker': 'Im Entwicklungsserver gibt es keine Benachrichtigungen',
};

export function pushSupportHint(support: PushSupport): string | undefined {
  return SUPPORT_HINTS[support];
}

/** `Notification.permission` of the browser. */
export type PushPermission = 'default' | 'granted' | 'denied';

const DENIED_HINT = 'Erlaube Benachrichtigungen in den Browser-Einstellungen für diese Seite.';

/** "✓ erlaubt" (AC-004), "nicht erlaubt" with the way out (AC-005); not yet asked: nothing. */
export function permissionStatus(permission: PushPermission): {
  label: string | undefined;
  hint: string | undefined;
} {
  if (permission === 'granted') return { label: '✓ erlaubt', hint: undefined };
  if (permission === 'denied') return { label: 'nicht erlaubt', hint: DENIED_HINT };
  return { label: undefined, hint: undefined };
}

const MAX_DEVICE_LABEL = 60;

function osOf(userAgent: string, touch: boolean): string | undefined {
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return 'Android';
  // iPadOS Safari presents itself as a Mac; only the touch screen tells it apart.
  if (/Macintosh/.test(userAgent)) return touch ? 'iPad' : 'Mac';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/CrOS/.test(userAgent)) return 'ChromeOS';
  if (/Linux/.test(userAgent)) return 'Linux';
  return undefined;
}

function browserOf(userAgent: string): string | undefined {
  if (/Edg(?:e|A|iOS)?\//.test(userAgent)) return 'Edge';
  if (/Firefox\/|FxiOS\//.test(userAgent)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(userAgent)) return 'Chrome';
  if (/Version\/[\d.]+.*Safari\//.test(userAgent)) return 'Safari';
  return undefined;
}

/**
 * The name of this device in "Deine Geräte": "Mac · Chrome", "iPhone · App" (installed),
 * "Windows · Edge"; unknown: "Browser". Coarse on purpose: no version, no model (personal data,
 * `10-security.md`).
 */
export function deviceLabel(input: { userAgent: string; standalone: boolean; touch: boolean }) {
  const parts = [
    osOf(input.userAgent, input.touch),
    input.standalone ? 'App' : browserOf(input.userAgent),
  ].filter((part): part is string => part !== undefined);
  const label = parts.length === 0 ? 'Browser' : parts.join(' · ');
  return label.slice(0, MAX_DEVICE_LABEL);
}

/** A row of "Deine Geräte": "Mac · Firefox · dieses Gerät", "Mac · Chrome · nicht erreichbar". */
export function deviceRowLabel(subscription: OwnPushSubscription): string {
  const parts = [subscription.label];
  if (subscription.isCurrent) parts.push('dieses Gerät');
  if (subscription.status === 'off') parts.push('aus');
  if (subscription.status === 'unreachable') parts.push('nicht erreichbar');
  return parts.join(' · ');
}

/** What the app knows about this device; nothing of it is synced (Decision 18). */
export interface DeviceState {
  support: PushSupport;
  online: boolean;
  permission: PushPermission;
  /** `push.wanted` on this device: undefined = never chosen here, false = switched off here. */
  wanted: boolean | undefined;
  /** The browser's current push subscription; keyMatches = made with today's VAPID key. */
  browser?: { endpoint: string; keyMatches: boolean };
  /** The push address this device registered last. */
  storedEndpoint?: string;
  /**
   * What `list_push_subscriptions` says about the browser's push address: missing = not known
   * to the server; undefined = not asked (offline, no subscription, request failed).
   */
  server?: 'active' | 'off' | 'unreachable' | 'missing';
}

export type DeviceAction =
  | { type: 'none' }
  /** Ask the browser; only ever as the first step of a tap (Decision 26, AC-003). */
  | { type: 'request-permission' }
  /** Create a browser subscription and register it. */
  | { type: 'subscribe' }
  /** Drop the browser subscription (other key, unreachable), create a new one, register it. */
  | { type: 'resubscribe' }
  /** Register the browser subscription; the old address, if any, is unregistered. */
  | { type: 'register'; staleEndpoint?: string }
  /** Switch the registered subscription on again (AC-008). */
  | { type: 'enable' }
  /** Forget this device: unsubscribe in the browser, clear `push.wanted` and the address. */
  | { type: 'forget' };

/**
 * start = opening the app with network; device-on = the switch "Auf diesem Gerät
 * benachrichtigen"; kind-on = switching on a kind or setting a time (Decision 26).
 */
export type DeviceTrigger = 'start' | 'device-on' | 'kind-on';

const NONE: DeviceAction = { type: 'none' };

function onStart(state: DeviceState): DeviceAction {
  if (state.wanted === undefined) return NONE;
  if (state.permission !== 'granted') return { type: 'forget' };
  const { browser, server } = state;
  const sameAddress = browser !== undefined && browser.endpoint === state.storedEndpoint;
  // Removed on another device (AC-041): this one forgets itself, also when it is switched off.
  if (sameAddress && server === 'missing') return { type: 'forget' };
  if (!state.wanted) return NONE;
  if (browser === undefined) return { type: 'subscribe' };
  if (!browser.keyMatches || server === 'unreachable') return { type: 'resubscribe' };
  if (server === 'missing') {
    return state.storedEndpoint === undefined
      ? { type: 'register' }
      : { type: 'register', staleEndpoint: state.storedEndpoint };
  }
  return NONE;
}

function onTap(state: DeviceState, trigger: 'device-on' | 'kind-on'): DeviceAction {
  if (trigger === 'kind-on' && state.wanted === false) return NONE;
  if (state.permission === 'denied') return NONE;
  if (state.permission === 'default') return { type: 'request-permission' };
  const { browser, server } = state;
  if (browser === undefined) return { type: 'subscribe' };
  if (!browser.keyMatches || server === 'unreachable') return { type: 'resubscribe' };
  if (server === 'active') return NONE;
  if (server === 'off') return trigger === 'device-on' ? { type: 'enable' } : NONE;
  return { type: 'register' };
}

/**
 * The next step for this device (Decision 18). Never asks for permission without a tap
 * (AC-003); a new address re-registers (AC-039); an address the server no longer knows is
 * forgotten (AC-041); a withdrawn permission forgets the device.
 */
export function deviceAction(state: DeviceState, trigger: DeviceTrigger): DeviceAction {
  if (state.support !== 'supported' || !state.online) return NONE;
  return trigger === 'start' ? onStart(state) : onTap(state, trigger);
}

/**
 * What the server says about this browser's push address, from "Deine Geräte" as asked with that
 * address (`is_current`): not listed = "missing" (removed elsewhere, AC-041).
 */
export function serverDeviceStatus(
  devices: readonly OwnPushSubscription[],
): NonNullable<DeviceState['server']> {
  return devices.find((device) => device.isCurrent)?.status ?? 'missing';
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding, as Web Push writes keys (RFC 8291). */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let at = 0; at < bytes.length; at += 3) {
    const a = bytes[at] ?? 0;
    const b = bytes[at + 1] ?? 0;
    const c = bytes[at + 2] ?? 0;
    const chunk = (a << 16) | (b << 8) | c;
    const chars = Math.min(4, Math.ceil(((bytes.length - at) * 8) / 6));
    for (let index = 0; index < chars; index++) {
      out += BASE64URL[(chunk >> (18 - index * 6)) & 63];
    }
  }
  return out;
}

/**
 * Reads base64url (padding allowed); undefined for anything else. Used to hand the public VAPID
 * key to the browser and to compare it with the key of an existing subscription (AC-039).
 */
export function base64UrlToBytes(text: string): Uint8Array | undefined {
  const trimmed = text.replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]*$/.test(trimmed) || trimmed.length % 4 === 1) return undefined;
  const bytes = new Uint8Array(Math.floor((trimmed.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let at = 0;
  for (const char of trimmed) {
    buffer = (buffer << 6) | BASE64URL.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[at++] = (buffer >> bits) & 255;
    }
  }
  return bytes;
}

/**
 * The title of "Was und wann": with the household's name when the person belongs to several, as
 * the settings hold per household (Offene Frage 3 e, Decision 25).
 */
export function kindsSectionTitle(householdName: string | undefined): string {
  return householdName === undefined
    ? 'Was und wann · gilt für alle Geräte'
    : `Was und wann · ${householdName} · gilt für alle Geräte`;
}

export interface ThisDeviceView {
  switchOn: boolean;
  switchDisabled: boolean;
  /** "✓ erlaubt", "nicht erlaubt". */
  status: string | undefined;
  hint: string | undefined;
  probeDisabled: boolean;
  probeHint: string | undefined;
}

/**
 * The section "Dieses Gerät" (AC-004 to AC-006, AC-010). Offline the switch keeps its state and
 * is greyed out; the app adds its usual offline hint.
 */
export function thisDeviceView(state: DeviceState): ThisDeviceView {
  const { label: status, hint: permissionHint } = permissionStatus(state.permission);
  const supportHint = pushSupportHint(state.support);
  const switchOn =
    state.support === 'supported' &&
    state.wanted === true &&
    state.permission === 'granted' &&
    state.browser !== undefined &&
    state.server !== 'off' &&
    state.server !== 'missing';
  return {
    switchOn,
    switchDisabled: state.support !== 'supported' || state.permission === 'denied' || !state.online,
    status: state.support === 'supported' ? status : undefined,
    hint: supportHint ?? permissionHint,
    probeDisabled: !switchOn || !state.online,
    probeHint: switchOn ? undefined : 'Erst auf diesem Gerät einschalten',
  };
}

// ---------- Targets of a tap ----------

export type NotificationTarget =
  /** Tagesüberblick → "Übersicht"; also every unknown or changed link (AC-038). */
  | { screen: 'overview'; householdId?: Id }
  /** Chore reminder → the chore on the page "Haushalt". */
  | { screen: 'chore'; choreId: Id; householdId?: Id }
  /** Reservation, activities of tomorrow → the day in the calendar, with the entry if one. */
  | { screen: 'calendar'; day: ISODate; entryId?: Id; householdId?: Id }
  /** Probe → the page "Benachrichtigungen". */
  | { screen: 'notificationSettings' };

const OVERVIEW: NotificationTarget = { screen: 'overview' };
const UuidSchema = z.uuid();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value: string): boolean {
  return DAY.test(value) && toISODate(parseISODate(value)) === value;
}

/** The first value of each parameter; undefined when the query cannot be decoded. */
function queryOf(query: string): Map<string, string> | undefined {
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (pair === '') continue;
    const at = pair.indexOf('=');
    try {
      const key = decodeURIComponent(at < 0 ? pair : pair.slice(0, at));
      const value = at < 0 ? '' : decodeURIComponent(pair.slice(at + 1));
      if (!params.has(key)) params.set(key, value);
    } catch {
      return undefined;
    }
  }
  return params;
}

/**
 * Reads the link of a notification (Decision 12, AC-037). Only own paths of the app count, with
 * valid ids and days; anything else, also a foreign host, `javascript:` or `//host`, opens the
 * "Übersicht" (AC-038). Of a repeated parameter the first counts; unknown ones are ignored.
 */
export function parseNotificationTarget(link: string): NotificationTarget {
  if (!link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return OVERVIEW;
  const [pathAndQuery = ''] = link.split('#');
  const at = pathAndQuery.indexOf('?');
  const path = at < 0 ? pathAndQuery : pathAndQuery.slice(0, at);
  const params = queryOf(at < 0 ? '' : pathAndQuery.slice(at + 1));
  if (!params) return OVERVIEW;

  const id = (key: string): Id | undefined | null => {
    const value = params.get(key);
    if (value === undefined) return undefined;
    const parsed = UuidSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  };
  const householdId = id('haushalt');
  if (householdId === null) return OVERVIEW;
  const household = householdId === undefined ? {} : { householdId };

  switch (path) {
    case '/':
      return { screen: 'overview', ...household };
    case '/haushalt': {
      const choreId = id('aufgabe');
      return choreId ? { screen: 'chore', choreId, ...household } : OVERVIEW;
    }
    case '/kalender': {
      const day = params.get('tag');
      const entryId = id('eintrag');
      if (day === undefined || !isDay(day) || entryId === null) return OVERVIEW;
      return { screen: 'calendar', day, ...(entryId ? { entryId } : {}), ...household };
    }
    case '/einstellungen/benachrichtigungen':
      return { screen: 'notificationSettings' };
    default:
      return OVERVIEW;
  }
}

/**
 * The address of the target's screen. The household is not part of it: the app switches to it
 * first (Decision 12).
 */
export function notificationTargetHref(target: NotificationTarget): string {
  switch (target.screen) {
    case 'overview':
      return '/';
    case 'chore':
      return `/haushalt?aufgabe=${target.choreId}`;
    case 'calendar':
      return target.entryId === undefined
        ? `/kalender?tag=${target.day}`
        : `/kalender?tag=${target.day}&eintrag=${target.entryId}`;
    case 'notificationSettings':
      return '/einstellungen/benachrichtigungen';
  }
}
