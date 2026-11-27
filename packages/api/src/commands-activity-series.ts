// Series of activities (spec 0041, REQ-003): planned with a rhythm, single Termine cancelled or
// moved, "Serie bearbeiten" for the Termine from today on. All on the diff path: one
// apply_changes call per command, so ending the old series, starting the new one and moving its
// exceptions happen together or not at all.
import {
  planSeriesEdit,
  seriesDraftProblem,
  SeriesReminderSchema,
  type ActivitySeries,
  type ActivitySeriesException,
  type Id,
  type ISODate,
  type SeriesChanges,
  type SeriesEditPlan,
  type TimeOfDay,
} from '@housekeeping/core';

import { commit, getData, newId, updateData } from './store';

export type SeriesDraft = Omit<ActivitySeries, 'id'>;

const NO_FUTURE = 'Die Serie hat keine Termine mehr.';

function checkDraft(
  draft: Pick<ActivitySeries, 'rule' | 'startsOn' | 'endsOn'> &
    Partial<Pick<ActivitySeries, 'reminder'>>,
): void {
  const problem = seriesDraftProblem(draft);
  if (problem) throw new Error(problem);
  // Spec 0059, REQ-003: the form checks the text first; this keeps a refused row from going out.
  if (draft.reminder && !SeriesReminderSchema.safeParse(draft.reminder).success) {
    throw new Error('Die Erinnerung passt so nicht.');
  }
}

const trimmedNote = (note: string | undefined) => note?.trim() || undefined;

/** "Einplanen" with a rhythm: a new series (AC-006, AC-007). Throws the form's hint. */
export function createActivitySeries(draft: SeriesDraft): Id {
  checkDraft(draft);
  return commit({ path: 'diff' }, () => {
    const series: ActivitySeries = { ...draft, id: newId(), note: trimmedNote(draft.note) };
    updateData((data) => ({ ...data, activitySeries: [...data.activitySeries, series] }));
    return series.id;
  });
}

function exceptionOf(seriesId: Id, on: ISODate): ActivitySeriesException | undefined {
  return getData().activitySeriesExceptions.find(
    (exception) => exception.seriesId === seriesId && exception.on === on,
  );
}

function putException(exception: ActivitySeriesException): void {
  updateData((data) => {
    const others = data.activitySeriesExceptions.filter((other) => other.id !== exception.id);
    return { ...data, activitySeriesExceptions: [...others, exception] };
  });
}

/** AC-008: "Termin absagen": only this Termin goes, the others stay. */
export function cancelOccurrence(seriesId: Id, on: ISODate): void {
  const existing = exceptionOf(seriesId, on);
  commit({ path: 'diff' }, () => putException({ id: existing?.id ?? newId(), seriesId, on }));
}

/** "Termin verschieben": this Termin on another day, optionally another Tageszeit and Uhrzeit. */
export function moveOccurrence(
  seriesId: Id,
  on: ISODate,
  to: { date: ISODate; slotId?: Id; startsAt?: TimeOfDay },
): void {
  const existing = exceptionOf(seriesId, on);
  commit({ path: 'diff' }, () =>
    putException({
      id: existing?.id ?? newId(),
      seriesId,
      on,
      movedTo: to.date,
      slotId: to.slotId,
      startsAt: to.startsAt,
    }),
  );
}

/** Takes back "absagen" or "verschieben": the Termin is as the rule gives it again. */
export function restoreOccurrence(seriesId: Id, on: ISODate): void {
  const existing = exceptionOf(seriesId, on);
  if (!existing) return;
  commit({ path: 'diff', maxDeletes: { activity_series_exceptions: 1 } }, () =>
    updateData((data) => ({
      ...data,
      activitySeriesExceptions: data.activitySeriesExceptions.filter(
        (exception) => exception.id !== existing.id,
      ),
    })),
  );
}

/**
 * AC-009: "Serie bearbeiten" changes the Termine from today on; the past keeps its values. A
 * series that has not started is changed as a whole. Throws when no Termin is left.
 */
export function editActivitySeries(id: Id, changes: SeriesChanges, today: ISODate): SeriesEditPlan {
  const data = getData();
  const series = data.activitySeries.find((candidate) => candidate.id === id);
  if (!series) throw new Error(NO_FUTURE);
  const clean: SeriesChanges =
    'note' in changes ? { ...changes, note: trimmedNote(changes.note) } : changes;
  checkDraft({ ...series, ...clean });
  const plan = planSeriesEdit(series, data.activitySeriesExceptions, clean, today);
  if (plan.kind === 'ended') throw new Error(NO_FUTURE);
  commit({ path: 'diff' }, () => {
    if (plan.kind === 'update') {
      updateData((current) => ({
        ...current,
        activitySeries: current.activitySeries.map((candidate) =>
          candidate.id === id ? { ...candidate, ...plan.changes } : candidate,
        ),
      }));
      return;
    }
    const next = plan.next ? { ...plan.next, id: newId() } : undefined;
    const moved = new Set(plan.movedExceptionIds);
    updateData((current) => ({
      ...current,
      activitySeries: [
        ...current.activitySeries.map((candidate) =>
          candidate.id === id ? { ...candidate, endsOn: plan.endsOld } : candidate,
        ),
        ...(next ? [next] : []),
      ],
      activitySeriesExceptions: next
        ? current.activitySeriesExceptions.map((exception) =>
            moved.has(exception.id) ? { ...exception, seriesId: next.id } : exception,
          )
        : current.activitySeriesExceptions,
    }));
  });
  return plan;
}

/** "Serie löschen": every Termin goes, past ones too; its exceptions go with it. */
export function deleteActivitySeries(id: Id): void {
  commit({ path: 'diff', maxDeletes: { activity_series: 1 } }, () =>
    updateData((data) => ({
      ...data,
      activitySeries: data.activitySeries.filter((series) => series.id !== id),
      activitySeriesExceptions: data.activitySeriesExceptions.filter(
        (exception) => exception.seriesId !== id,
      ),
    })),
  );
}
