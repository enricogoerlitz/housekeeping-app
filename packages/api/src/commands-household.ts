import {
  findArticleByName,
  type Absence,
  type Article,
  type FeedbackEntry,
  type Id,
  type ISODate,
} from '@housekeeping/core';

import {
  getData,
  getState,
  isBackendMode,
  newId,
  nowISO,
  setState,
  simulateOffline,
  updateData,
} from './store';

// Write side: every change to the data goes through a command. The assistant uses the same
// commands as the screens (see assistant.ts), so there is exactly one implementation per action.

export function switchHousehold(householdId: Id): void {
  setState((state) =>
    state.households[householdId] ? { ...state, activeHouseholdId: householdId } : state,
  );
}

/** Demo only: who is using the app. */
export function setCurrentMember(memberId: Id): void {
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

export function updateArticle(
  articleId: Id,
  patch: Partial<Pick<Article, 'areaId' | 'isPantry' | 'diet' | 'synonyms'>>,
): void {
  updateData((data) => ({
    ...data,
    articles: data.articles.map((article) =>
      article.id === articleId ? { ...article, ...patch } : article,
    ),
  }));
}

/** Assigning an area applies to the article from now on, on every list. */
export function assignArticleArea(articleId: Id, areaId: Id | undefined): void {
  updateArticle(articleId, { areaId });
}

export function addAbsence(input: {
  memberId?: Id;
  from: ISODate;
  to: ISODate;
  note?: string;
}): Id {
  if (input.to < input.from) throw new Error('Das Ende liegt vor dem Anfang.');
  const absence: Absence = { id: newId('abs'), ...input };
  updateData((data) => ({ ...data, absences: [...data.absences, absence] }));
  return absence.id;
}

export function removeAbsence(absenceId: Id): void {
  updateData((data) => ({
    ...data,
    absences: data.absences.filter((absence) => absence.id !== absenceId),
  }));
}

export function addFeedback(input: {
  kind: FeedbackEntry['kind'];
  text: string;
  screen?: string;
}): Id {
  const text = input.text.trim();
  if (!text) throw new Error('Der Text fehlt.');
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
}

/** "+1": supports someone else's feedback; a second call takes the vote back. */
export function toggleFeedbackVote(feedbackId: Id): void {
  const me = getState().currentMemberId;
  updateData((data) => ({
    ...data,
    feedback: data.feedback.map((entry) =>
      entry.id === feedbackId
        ? {
            ...entry,
            votes: entry.votes.includes(me)
              ? entry.votes.filter((id) => id !== me)
              : [...entry.votes, me],
          }
        : entry,
    ),
  }));
}
