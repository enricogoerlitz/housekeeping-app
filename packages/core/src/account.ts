import { dietPreferenceLabel } from './diet';
import { householdClock } from './reminder';
import type { DietPreference, FeedbackEntry, Id, Member } from './types';

// Spec 0027 "Verwalten und Konto": the words and checks of invitations, the own profile, renaming
// and deleting a household, the own feedback and "Jetzt abgleichen"
// (spec 0051: the household of "Benachrichtigungen" is gone with Web Push). The server checks the same (supabase migration manage_household_and_account).

// ---------- Invitations (REQ-001, REQ-002) ----------

/** Under the field "Einladen" (AC-006, Decision 11). */
export const INVITE_FIELD_HINT =
  'Ist die Adresse neu, muss Enrico sie zusätzlich bei Google als Testnutzer eintragen. Sonst zeigt Google beim Anmelden „Zugriff blockiert“.';

/** Offline the offline hint comes first, the Google hint stays (AC-007). */
export function invitationHint(offlineHint: string | undefined): string {
  return offlineHint ? `${offlineHint}\n${INVITE_FIELD_HINT}` : INVITE_FIELD_HINT;
}

/** The notice after inviting (AC-006). */
export function invitedNotice(email: string): string {
  return `${email} ist eingeladen. Ist die Adresse neu, muss Enrico sie bei Google eintragen.`;
}

/** The notice after "Zurückziehen" (AC-001). */
export function withdrawnNotice(email: string): string {
  return `Einladung an ${email} zurückgezogen`;
}

// ---------- Profile (REQ-003) ----------

/** The eight avatar colours; the same list is `private.profile_palette()` (Decision 9). */
export const PROFILE_COLORS: readonly { name: string; hex: string }[] = [
  { name: 'Blau', hex: '#3E6C8E' },
  { name: 'Beere', hex: '#A8456B' },
  { name: 'Grün', hex: '#5B7F3A' },
  { name: 'Kupfer', hex: '#B5652B' },
  { name: 'Violett', hex: '#6A4C93' },
  { name: 'Petrol', hex: '#2F7F7A' },
  { name: 'Ocker', hex: '#8C6D1F' },
  { name: 'Rot', hex: '#9C3D3D' },
];

export const MAX_NAME_LENGTH = 80;
export const MAX_DISLIKES = 50;
export const MAX_DISLIKE_LENGTH = 40;
export const NAME_MISSING = 'Der Name fehlt.';
const NAME_TOO_LONG = `Höchstens ${MAX_NAME_LENGTH} Zeichen`;
export const DISLIKES_FULL = `Höchstens ${MAX_DISLIKES} Abneigungen`;

export interface ProfileDraft {
  name: string;
  color: string;
  dietPreference: DietPreference;
  dislikes: string[];
}

export function profileDraftFrom(member: Member): ProfileDraft {
  return {
    name: member.name,
    color: member.color,
    dietPreference: member.dietPreference,
    dislikes: [...member.dislikes],
  };
}

function nameError(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return NAME_MISSING;
  if ([...trimmed].length > MAX_NAME_LENGTH) return NAME_TOO_LONG;
  return undefined;
}

/** AC-010: what keeps "Speichern" from sending. */
export function profileDraftErrors(draft: ProfileDraft): { name?: string } {
  const name = nameError(draft.name);
  return name ? { name } : {};
}

/**
 * "Abneigung hinzufügen" (AC-010): trimmed, empty adds nothing, a duplicate ignoring case adds
 * nothing, at most 40 characters and 50 entries.
 */
export function addDislike(
  dislikes: readonly string[],
  input: string,
): { dislikes: string[]; error?: string } {
  const text = input.trim();
  const current = [...dislikes];
  if (text === '') return { dislikes: current };
  if (current.some((dislike) => dislike.toLowerCase() === text.toLowerCase())) {
    return { dislikes: current };
  }
  if (current.length >= MAX_DISLIKES) return { dislikes: current, error: DISLIKES_FULL };
  if ([...text].length > MAX_DISLIKE_LENGTH) {
    return { dislikes: current, error: `Höchstens ${MAX_DISLIKE_LENGTH} Zeichen` };
  }
  return { dislikes: [...current, text] };
}

/** AC-011: whether closing asks "Änderungen verwerfen?". Edge spaces of the name do not count. */
export function profileDraftChanged(stored: Member, draft: ProfileDraft): boolean {
  return (
    draft.name.trim() !== stored.name ||
    draft.color !== stored.color ||
    draft.dietPreference !== stored.dietPreference ||
    draft.dislikes.join('\n') !== stored.dislikes.join('\n')
  );
}

/** "vegetarisch · mag nicht: Koriander" under a member (AC-009, Decision 8). */
export function memberProfileLine(member: Member): string {
  const diet = dietPreferenceLabel(member.dietPreference);
  return member.dislikes.length === 0 ? diet : `${diet} · mag nicht: ${member.dislikes.join(', ')}`;
}

// ---------- Household (REQ-004, REQ-005) ----------

export type HouseholdRename =
  { action: 'keep' } | { action: 'save'; name: string } | { action: 'invalid'; error: string };

/** AC-015: trimmed, 1–80 characters; unchanged saves nothing. */
export function householdRename(current: string, input: string): HouseholdRename {
  const error = nameError(input);
  if (error) return { action: 'invalid', error };
  const name = input.trim();
  return name === current ? { action: 'keep' } : { action: 'save', name };
}

/** AC-017: deleting depends on being the last member, not on a role. */
export function canDeleteHousehold(memberCount: number): boolean {
  return memberCount === 1;
}

/** "a@…", "a@… und b@…", "a@…, b@… und c@…". */
function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
}

/** The question before deleting (AC-018). */
export function deleteHouseholdPrompt(
  name: string,
  invitationEmails: readonly string[],
): { title: string; message: string; invitations: string | undefined } {
  return {
    title: `„${name}“ endgültig löschen?`,
    message: `Alles aus „${name}“ wird gelöscht: Rezepte, Kalender, Einkaufsliste, Artikel und Märkte, Aufgaben, Reisen und Reisetaschen, Restaurants, Aktivitäten, Feedback und alle Fotos. Das lässt sich nicht rückgängig machen.`,
    invitations:
      invitationEmails.length === 0
        ? undefined
        : invitationEmails.length === 1
          ? `Die Einladung an ${invitationEmails[0]} verfällt.`
          : `Die Einladungen an ${listed(invitationEmails)} verfallen.`,
  };
}

/** AC-018: exactly the name, edge spaces aside; "wg köln" is not "WG Köln". */
export function deleteConfirmMatches(name: string, typed: string): boolean {
  return typed.trim() === name;
}

// ---------- Feedback (REQ-006) ----------

export type FeedbackAction = 'edit' | 'delete';

/** AC-027: only the author; "Bearbeiten" only while the status is "neu". */
export function feedbackActions(entry: FeedbackEntry, me: Id): FeedbackAction[] {
  if (entry.authorId !== me) return [];
  return entry.status === 'new' ? ['edit', 'delete'] : ['delete'];
}

/** AC-026: "Feedback löschen?" and whose "+1" goes with it. */
export function feedbackDeletePrompt(
  entry: FeedbackEntry,
  names: ReadonlyMap<Id, string>,
): { title: string; message: string | undefined } {
  const voters = entry.votes
    .filter((id) => id !== entry.authorId)
    .map((id) => names.get(id))
    .filter((name): name is string => name !== undefined);
  return {
    title: 'Feedback löschen?',
    message:
      voters.length === 0
        ? undefined
        : voters.length === 1
          ? `Das „+1“ von ${voters[0]} geht mit.`
          : `Die „+1“ von ${listed(voters)} gehen mit.`,
  };
}

/** AC-028, Decision 10: above the filters, without a person's name. */
export const FEEDBACK_STATUS_NOTE =
  'Den Status setzt der Entwickler der App, wenn er ein Feedback bearbeitet hat.';

// ---------- "Jetzt abgleichen" (REQ-010) ----------

/** "16:58", "9:30" in the given zone. */
function clockTime(time: string): string {
  const [hour = '0', minute = '00'] = time.split(':');
  return `${Number(hour)}:${minute}`;
}

/**
 * The row "Zuletzt abgeglichen" (AC-039, AC-041): the status in grey and "Jetzt abgleichen" as the
 * only link (review 0003, B-13); the link's screen-reader name carries the status.
 */
export function syncRow(input: {
  lastSyncedAt: string | undefined;
  syncing: boolean;
  now: Date;
  timeZone: string;
}): { status: string; action: string; accessibilityLabel: string } {
  let when: string | undefined;
  if (input.lastSyncedAt) {
    const at = householdClock(new Date(input.lastSyncedAt), input.timeZone);
    const today = householdClock(input.now, input.timeZone).date;
    const [, month = '', day = ''] = at.date.split('-');
    const dayLabel = at.date === today ? 'heute' : `${Number(day)}.${Number(month)}.`;
    when = `${dayLabel}, ${clockTime(at.time)}`;
  }
  const accessibilityLabel = when
    ? `Jetzt abgleichen, zuletzt abgeglichen ${when}`
    : 'Jetzt abgleichen, noch nicht abgeglichen';
  return {
    status: when ? `Zuletzt abgeglichen: ${when}` : 'Noch nicht abgeglichen',
    action: input.syncing ? 'Wird abgeglichen …' : 'Jetzt abgleichen',
    accessibilityLabel,
  };
}
