import { z } from 'zod';

import { findDuplicateActivity } from './activities';
import { AgentPlaceSchema, type AgentCard, type AgentPlace } from './ai-agent';
import { addDays, parseISODate, toISODate } from './dates';
import { overviewTitle } from './overview';
import { findDuplicateRestaurant } from './restaurants';
import { normalizeText } from './text';
import type { Activity, ActivityKind, GeoPoint, Id, ISODate, Restaurant, Trip } from './types';

// Spec 0066, app side of the KI-Agent: the places of "In der Nähe von" (trips, "Zuletzt"), what
// "Speichern" creates from a card, and the line of a chat in "Verlauf".

// ---------- "Aus euren Reisen" (REQ-004, decision 9) ----------

const MONTHS = [
  'Jan.',
  'Feb.',
  'März',
  'Apr.',
  'Mai',
  'Juni',
  'Juli',
  'Aug.',
  'Sept.',
  'Okt.',
  'Nov.',
  'Dez.',
];

/** "3.–7. Dez.", over a month end "29. Nov. – 2. Dez.". */
function dateRange(from: ISODate, to: ISODate): string {
  const a = parseISODate(from);
  const b = parseISODate(to);
  const month = (date: Date) => MONTHS[date.getMonth()] ?? '';
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    return `${a.getDate()}.–${b.getDate()}. ${month(b)}`;
  return `${a.getDate()}. ${month(a)} – ${b.getDate()}. ${month(b)}`;
}

export interface TripPlace {
  tripId: Id;
  /** The first line of the trip's note, e.g. "London". */
  label: string;
  dates: string;
}

/**
 * Trips have no destination field; their note names it (decision 9). Running and coming trips
 * with a note, soonest first (AC-011).
 */
export function tripPlaces(trips: readonly Trip[], today: ISODate): TripPlace[] {
  return trips
    .filter((trip) => trip.to >= today && (trip.note ?? '').trim() !== '')
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((trip) => ({
      tripId: trip.id,
      label: (trip.note ?? '').trim().split('\n')[0]!.trim().slice(0, 60),
      dates: dateRange(trip.from, trip.to),
    }));
}

// ---------- "Zuletzt" (AC-013) ----------

const RECENT_MAX = 5;
const RecentPlacesSchema = z.array(AgentPlaceSchema).max(20);

const placeKey = (place: AgentPlace) =>
  `${normalizeText(place.label)}|${place.location ? `${place.location.lat},${place.location.lng}` : ''}`;

/** The chosen place first, without doubles, at most five; the device location never. */
export function rememberPlace(recent: readonly AgentPlace[], place: AgentPlace): AgentPlace[] {
  if (place.source === 'device') return [...recent];
  const key = placeKey(place);
  return [place, ...recent.filter((entry) => placeKey(entry) !== key)].slice(0, RECENT_MAX);
}

export function encodeRecentPlaces(recent: readonly AgentPlace[]): string {
  return JSON.stringify(recent);
}

/** What the device kept; anything broken counts as nothing. */
export function decodeRecentPlaces(raw: string | null | undefined): AgentPlace[] {
  if (!raw) return [];
  try {
    const parsed = RecentPlacesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

// ---------- "Speichern" (REQ-007) ----------

export interface CardRestaurantDraft {
  name: string;
  address?: string;
  location?: GeoPoint;
  mapsUrl?: string;
  cuisine?: string;
  priceLevel?: 1 | 2 | 3 | 4;
  websiteUrl?: string;
}

export interface CardActivityDraft {
  name: string;
  description?: string;
  placeName?: string;
  address?: string;
  location?: GeoPoint;
  mapsUrl?: string;
  websiteUrl?: string;
  kindId?: Id;
}

const defined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;

/**
 * Spec 0067 (preview 28.11.): the place a message goes with. The device's location never blocks
 * sending: without one (denied, timed out, a desktop without GPS) the message goes without
 * coordinates ("Ort unbekannt" in the context) and, for "Ausgehen", the chip says so calmly; the
 * agent asks for a place only when the question needs one. A chosen place is sent as it is.
 */
export function placeToSend(
  place: AgentPlace,
  location: GeoPoint | undefined,
  outing: boolean,
): { place: AgentPlace; hint?: true } {
  if (place.source !== 'device') return { place };
  if (location) return { place: { ...place, location } };
  return outing ? { place, hint: true } : { place };
}

/** AC-021: the card as a restaurant; its kind ("Deutsch") is the cuisine. */
export function restaurantDraftOfCard(card: AgentCard): CardRestaurantDraft {
  return defined({
    name: card.name,
    address: card.address,
    location: card.location,
    mapsUrl: card.mapsUrl,
    cuisine: card.category,
    priceLevel: card.priceLevel,
    websiteUrl: card.websiteUrl,
  });
}

/** AC-023: the card as an activity; a kind only when the household has one of that name. */
export function activityDraftOfCard(
  card: AgentCard,
  kinds: readonly ActivityKind[],
): CardActivityDraft {
  const category = card.category ? normalizeText(card.category) : '';
  const kind = category ? kinds.find((entry) => normalizeText(entry.name) === category) : undefined;
  return defined({
    name: card.name,
    description: card.why || undefined,
    placeName: card.name,
    address: card.address,
    location: card.location,
    mapsUrl: card.mapsUrl,
    websiteUrl: card.websiteUrl,
    kindId: kind?.id,
  });
}

/** AC-022: the restaurant or activity this card was saved as before (same link or name). */
export function savedPlaceOf(
  card: AgentCard,
  restaurants: readonly Restaurant[],
  activities: readonly Activity[],
): { kind: 'restaurant' | 'activity'; id: Id } | undefined {
  if (card.kind === 'restaurant') {
    const byLink = card.mapsUrl
      ? restaurants.find((restaurant) => restaurant.mapsUrl === card.mapsUrl)
      : undefined;
    const found =
      byLink ??
      findDuplicateRestaurant({ name: card.name, location: card.location }, [...restaurants]);
    return found ? { kind: 'restaurant', id: found.id } : undefined;
  }
  const byLink = card.mapsUrl
    ? activities.find((activity) => activity.mapsUrl === card.mapsUrl)
    : undefined;
  const found = byLink ?? findDuplicateActivity(card.name, [...activities]);
  return found ? { kind: 'activity', id: found.id } : undefined;
}

// ---------- "Verlauf" (AC-024) ----------

/** "Friedrichshain · Mo., 23. Nov. · Nadja"; today "heute", yesterday "gestern". */
export function chatMetaLine(
  chat: { placeLabel?: string; createdAt: string; createdBy?: Id },
  names: Readonly<Record<Id, string>>,
  today: ISODate,
): string {
  const day = toISODate(new Date(chat.createdAt));
  const when =
    day === today
      ? 'heute'
      : day === addDays(today, -1)
        ? 'gestern'
        : overviewTitle(day, today, 'short');
  const who = chat.createdBy ? names[chat.createdBy] : undefined;
  return [chat.placeLabel, when, who].filter(Boolean).join(' · ');
}

// ---------- The answer's text ----------

export interface AnswerSpan {
  text: string;
  bold: boolean;
  /** Spec 0067: an https link of the answer; opened in the app's way (in-app view on iPhone). */
  url?: string;
}

export interface AnswerBlock {
  kind: 'paragraph' | 'bullet';
  spans: AnswerSpan[];
}

function boldSpans(line: string): AnswerSpan[] {
  const spans: AnswerSpan[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
    if (match.index > last) spans.push({ text: line.slice(last, match.index), bold: false });
    spans.push({ text: match[1]!, bold: true });
    last = match.index + match[0].length;
  }
  if (last < line.length) spans.push({ text: line.slice(last), bold: false });
  return spans;
}

/** "[label](https://…)" or a bare https address (without a closing dot or bracket). */
const LINK =
  /\[([^\]]{1,200})\]\((https:\/\/[^\s)]{1,2000})\)|https:\/\/[^\s<>()]{0,2000}[^\s<>().,;:!?"“”]/g;

/** Spec 0067: links are spans of their own; only https, never another scheme. */
function spansOf(line: string): AnswerSpan[] {
  const spans: AnswerSpan[] = [];
  let last = 0;
  LINK.lastIndex = 0;
  for (let match = LINK.exec(line); match; match = LINK.exec(line)) {
    if (match.index > last) spans.push(...boldSpans(line.slice(last, match.index)));
    const url = match[2] ?? match[0];
    const label = match[1] ?? url.replace(/^https:\/\/(www\.)?/, '');
    spans.push({ text: label, bold: false, url });
    last = match.index + match[0].length;
  }
  if (last < line.length) spans.push(...boldSpans(line.slice(last)));
  return spans;
}

/**
 * The agent writes a little Markdown: paragraphs, "- " bullets, **bold** names, sometimes a "###"
 * heading. The app shows exactly that as plain text with bold spans; anything else stays text,
 * nothing is ever rendered as HTML (10-security).
 */
export function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  const close = () => {
    if (paragraph.length > 0)
      blocks.push({ kind: 'paragraph', spans: spansOf(paragraph.join(' ')) });
    paragraph = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') {
      close();
    } else if (/^#{1,6}\s+/.test(line)) {
      close();
      const title = line.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '');
      blocks.push({ kind: 'paragraph', spans: [{ text: title, bold: true }] });
    } else if (/^[-*•]\s+/.test(line)) {
      close();
      blocks.push({ kind: 'bullet', spans: spansOf(line.replace(/^[-*•]\s+/, '')) });
    } else {
      paragraph.push(line);
    }
  }
  close();
  return blocks;
}
