import {
  findArticleByName,
  normalizeText,
  planAbsenceWrite,
  validateAbsenceDraft,
  type Absence,
  type Article,
  type FeedbackEntry,
  type Id,
  type ISODate,
} from '@housekeeping/core';

import { householdCall, WRITE_REJECTED_MESSAGE } from './backend';
import { starterAreas } from './starter/areas';
import { starterCatalog } from './starter/catalog';
import {
  commit,
  getData,
  getState,
  isBackendMode,
  newId,
  nowISO,
  rememberActiveHousehold,
  setState,
  simulateOffline,
  updateData,
} from './store';
import { TransportError, type Transport } from './transport';

// Write side: every change to the data goes through a command. The assistant uses the same
// commands as the screens (see assistant.ts), so there is exactly one implementation per action.
// In backend mode each command is one change sent to the server (ADR-0011): `commit` with the
// diff path, an own RPC, or the store queue.

/** Shows another household; in backend mode the choice is kept for the next start. */
export function switchHousehold(householdId: Id): void {
  setState((state) =>
    state.households[householdId] ? { ...state, activeHouseholdId: householdId } : state,
  );
  if (getState().activeHouseholdId === householdId) rememberActiveHousehold(householdId);
}

/** Demo only: who is using the app. With the backend it is always the signed-in person. */
export function setCurrentMember(memberId: Id): void {
  if (isBackendMode()) throw new Error('The current member is the signed-in user.');
  setState((state) => ({ ...state, currentMemberId: memberId }));
}

/**
 * Demo switch for the offline state. Going back online "syncs": the markers on items that were
 * changed offline disappear.
 */
export function setOffline(offline: boolean): void {
  // Backend mode: the switch blocks the transport, so the app behaves as without network.
  if (isBackendMode()) {
    simulateOffline(offline);
    return;
  }
  setState((state) => ({ ...state, offline }));
  if (!offline) {
    updateData((data) =>
      data.items.some((item) => item.pendingSync)
        ? {
            ...data,
            items: data.items.map((item) =>
              item.pendingSync ? { ...item, pendingSync: undefined } : item,
            ),
          }
        : data,
    );
  }
}

/**
 * Finds the article for a typed name (name or synonym) or creates a new one.
 * A new article has no area and an unknown diet until someone sets them.
 * Runs inside the calling command, so a new article is part of that command's change.
 */
export function resolveArticle(name: string): { article: Article; created: boolean } {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const existing = findArticleByName(trimmed, getData().articles);
  if (existing) return { article: existing, created: false };
  const article: Article = {
    id: newId('art'),
    name: trimmed,
    synonyms: [],
    diet: 'unknown',
    isPantry: false,
  };
  updateData((data) => ({ ...data, articles: [...data.articles, article] }));
  return { article, created: true };
}

type ArticlePatch = Partial<Pick<Article, 'areaId' | 'isPantry' | 'diet' | 'synonyms'>>;

function patchArticle(articleId: Id, patch: ArticlePatch): void {
  updateData((data) => ({
    ...data,
    articles: data.articles.map((article) =>
      article.id === articleId ? { ...article, ...patch } : article,
    ),
  }));
}

export function updateArticle(articleId: Id, patch: ArticlePatch): void {
  commit({ path: 'diff' }, () => patchArticle(articleId, patch));
}

/** Assigning an area applies to the article from now on, on every list. A store action. */
export function assignArticleArea(articleId: Id, areaId: Id | undefined): void {
  commit({ path: 'queue', action: { kind: 'assignArea', articleId, areaId: areaId ?? null } }, () =>
    patchArticle(articleId, { areaId }),
  );
}

export function addAbsence(input: {
  memberId?: Id;
  from: ISODate;
  to: ISODate;
  note?: string;
}): Id {
  if (input.to < input.from) throw new Error('Das Ende liegt vor dem Anfang.');
  return commit({ path: 'diff' }, () => {
    const absence: Absence = { id: newId('abs'), ...input };
    updateData((data) => ({ ...data, absences: [...data.absences, absence] }));
    return absence.id;
  });
}

/**
 * Saves the absence window (spec 0010, REQ-010; D23) as one change: all members chosen → one
 * absence of the whole household, otherwise one per person. `replaceIds` are the absences of the
 * stripe being edited; they are reused for the same person or removed.
 */
export function saveAbsences(input: {
  replaceIds: Id[];
  memberIds: Id[];
  from: ISODate;
  to: ISODate;
  note?: string;
}): void {
  const problems = validateAbsenceDraft(input);
  if (problems.noOne) throw new Error('Wähle, wer weg ist.');
  if (problems.toBeforeFrom) throw new Error('Das Ende liegt vor dem Anfang.');
  const data = getData();
  const existing = data.absences.filter((absence) => input.replaceIds.includes(absence.id));
  const plan = planAbsenceWrite({
    existing,
    memberIds: input.memberIds,
    allMemberIds: data.household.memberIds,
    from: input.from,
    to: input.to,
    note: input.note?.trim() || undefined,
  });
  commit({ path: 'diff', maxDeletes: { absences: plan.removeIds.length } }, () =>
    updateData((current) => {
      const updated = new Map(plan.update.map((absence) => [absence.id, absence]));
      const kept = current.absences
        .filter((absence) => !plan.removeIds.includes(absence.id))
        .map((absence) => updated.get(absence.id) ?? absence);
      const created: Absence[] = plan.create.map((row) => ({ id: newId('abs'), ...row }));
      return { ...current, absences: [...kept, ...created] };
    }),
  );
}

/** Removes the absences of one stripe or row together (spec 0010, AC-037). */
export function removeAbsences(absenceIds: Id[]): void {
  commit({ path: 'diff', maxDeletes: { absences: absenceIds.length } }, () =>
    updateData((data) => ({
      ...data,
      absences: data.absences.filter((absence) => !absenceIds.includes(absence.id)),
    })),
  );
}

export function removeAbsence(absenceId: Id): void {
  commit({ path: 'diff', maxDeletes: { absences: 1 } }, () =>
    updateData((data) => ({
      ...data,
      absences: data.absences.filter((absence) => absence.id !== absenceId),
    })),
  );
}

export function addFeedback(input: {
  kind: FeedbackEntry['kind'];
  text: string;
  screen?: string;
}): Id {
  const text = input.text.trim();
  if (!text) throw new Error('Der Text fehlt.');
  return commit({ path: 'diff' }, () => {
    const entry: FeedbackEntry = {
      id: newId('fb'),
      kind: input.kind,
      text,
      status: 'new',
      authorId: getState().currentMemberId,
      createdAt: nowISO(),
      votes: [],
      screen: input.screen,
    };
    updateData((data) => ({ ...data, feedback: [entry, ...data.feedback] }));
    return entry.id;
  });
}

/** "+1": supports someone else's feedback; a second call takes the vote back. */
export function toggleFeedbackVote(feedbackId: Id): void {
  const me = getState().currentMemberId;
  const entry = getData().feedback.find((candidate) => candidate.id === feedbackId);
  if (!entry) return;
  const voted = !entry.votes.includes(me);
  commit(
    {
      path: 'rpc',
      send: (transport) => transport.setFeedbackVote(feedbackId, voted),
      inverse: (transport) => transport.setFeedbackVote(feedbackId, !voted),
    },
    () =>
      updateData((data) => ({
        ...data,
        feedback: data.feedback.map((candidate) =>
          candidate.id === feedbackId
            ? {
                ...candidate,
                votes: voted ? [...candidate.votes, me] : candidate.votes.filter((id) => id !== me),
              }
            : candidate,
        ),
      })),
  );
}

// ---------- Household, invitations, membership (backend only; wait for the server) ----------

export const INVALID_EMAIL_MESSAGE = 'Das ist keine E-Mail-Adresse';
export const LAST_MEMBER_MESSAGE = 'Du bist das letzte Mitglied des Haushalts.';
export const INVITATION_GONE_MESSAGE = 'Die Einladung gibt es nicht mehr.';

const MESSAGES: Record<string, string> = {
  invalid_email: INVALID_EMAIL_MESSAGE,
  last_member: LAST_MEMBER_MESSAGE,
  invitation_not_found: INVITATION_GONE_MESSAGE,
  invalid_name: 'Der Name passt nicht – höchstens 80 Zeichen.',
  already_member: 'Diese Person ist schon Mitglied.',
  member_not_found: 'Diese Person ist kein Mitglied mehr.',
};

/** Same rule as `private.is_valid_email` on the server. */
const EMAIL = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

/** Starter areas and catalog in the format of `private.apply_starter` (keys from core). */
export function starterPayload() {
  return {
    areas: starterAreas.map((area) => ({ key: area.key, name: area.name })),
    articles: starterCatalog.map((article) => ({
      name: article.name,
      name_key: normalizeText(article.name),
      synonyms: article.synonyms ?? [],
      synonym_keys: (article.synonyms ?? []).map(normalizeText),
      area: article.area,
      diet: article.diet,
      is_pantry: article.pantry ?? false,
    })),
  };
}

/** One RPC, then a pull; a refusal becomes a German message (offline: OfflineError). */
async function householdRpc<T>(send: (transport: Transport) => Promise<T>): Promise<T> {
  if (!isBackendMode()) throw new Error('Haushalte gibt es nur mit Anmeldung.');
  try {
    return await householdCall(send);
  } catch (error) {
    if (!(error instanceof TransportError)) throw error;
    throw new Error(
      (error.kind === 'permanent' ? MESSAGES[error.code] : undefined) ?? WRITE_REJECTED_MESSAGE,
    );
  }
}

/** A new household with the starter areas, the starter catalog and a default list (AC-010). */
export function createHousehold(name: string): Promise<Id> {
  const trimmed = name.trim();
  if (!trimmed) return Promise.reject(new Error('Der Name fehlt.'));
  return householdRpc((transport) => transport.createHousehold(trimmed, starterPayload()));
}

/** Invites a Google address into the active household (AC-008, AC-009). */
export function inviteMember(email: string): Promise<Id> {
  const address = email.trim().toLowerCase();
  if (!EMAIL.test(address)) return Promise.reject(new Error(INVALID_EMAIL_MESSAGE));
  const householdId = getState().activeHouseholdId;
  return householdRpc((transport) => transport.inviteMember(householdId, address));
}

/** Joins the household of an invitation; resolves with its id. */
export function acceptInvitation(invitationId: Id): Promise<Id> {
  return householdRpc((transport) => transport.acceptInvitation(invitationId));
}

export function declineInvitation(invitationId: Id): Promise<void> {
  return householdRpc((transport) => transport.declineInvitation(invitationId));
}

/** Removes a person (or oneself: leaving) from the active household (AC-012). */
export function removeMember(profileId: Id): Promise<void> {
  const householdId = getState().activeHouseholdId;
  return householdRpc((transport) => transport.removeMember(householdId, profileId));
}
