import type { Id } from './types';

// The timers of the cooking mode (spec 0023, REQ-010, Decision 5): a step's timer keeps running
// while other steps are shown, several at once; leaving the cooking mode ends them (they live in
// the screen only). The clock is passed in, so the rules are pure.

export interface StepTimer {
  stepId: Id;
  /** "Schritt 4": the step's place in the cooking mode, from 1. */
  stepNumber: number;
  /** Time left when it was last started or paused. */
  remainingMs: number;
  /** When it was started; undefined while paused. */
  startedAt?: number;
}

/** Started timers by step id; a step without entry shows "Timer 35 Min". */
export type StepTimers = Readonly<Record<Id, StepTimer>>;

function remaining(timer: StepTimer, now: number): number {
  if (timer.startedAt === undefined) return timer.remainingMs;
  // A clock that has not ticked since the start reads as the start.
  return Math.max(0, timer.remainingMs - Math.max(0, now - timer.startedAt));
}

/** "Start": from the full time, or on from a pause. */
export function startStepTimer(
  timers: StepTimers,
  step: { stepId: Id; stepNumber: number; minutes: number },
  now: number,
): StepTimers {
  const current = timers[step.stepId];
  const remainingMs = current ? remaining(current, now) : step.minutes * 60_000;
  return {
    ...timers,
    [step.stepId]: {
      stepId: step.stepId,
      stepNumber: step.stepNumber,
      remainingMs,
      startedAt: now,
    },
  };
}

/** "Pause": keeps the time left. */
export function pauseStepTimer(timers: StepTimers, stepId: Id, now: number): StepTimers {
  const current = timers[stepId];
  if (!current || current.startedAt === undefined) return timers;
  return {
    ...timers,
    [stepId]: { ...current, remainingMs: remaining(current, now), startedAt: undefined },
  };
}

/** "Zurücksetzen": back to "Timer 35 Min". */
export function resetStepTimer(timers: StepTimers, stepId: Id): StepTimers {
  const { [stepId]: _gone, ...rest } = timers;
  return rest;
}

export function isTimerRunning(timer: StepTimer | undefined, now: number): boolean {
  return timer?.startedAt !== undefined && remaining(timer, now) > 0;
}

export function isTimerFinished(timer: StepTimer | undefined, now: number): boolean {
  return timer !== undefined && remaining(timer, now) === 0;
}

/**
 * The timers that ring now (spec 0056, REQ-007): run out since the last look (`previous`, the
 * `finished` of the call before). A run-out timer rings once; after "Zurücksetzen" it is gone
 * from `finished`, so the next run-out rings again. Paused timers never ring.
 */
export function timersToRing(
  previous: ReadonlySet<Id>,
  timers: StepTimers,
  now: number,
): { ring: Id[]; finished: Set<Id> } {
  const finished = new Set(
    Object.values(timers)
      .filter((timer) => timer.startedAt !== undefined && remaining(timer, now) === 0)
      .map((timer) => timer.stepId),
  );
  return { ring: [...finished].filter((id) => !previous.has(id)), finished };
}

/** "34:58", "1:30:00": the time left, rounded up to whole seconds. */
function clock(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** The chip of a step: "Timer 35 Min", "Timer 34:58", "Timer 34:00 · Pause", "Timer abgelaufen". */
export function stepTimerLabel(timer: StepTimer | undefined, minutes: number, now: number): string {
  if (timer === undefined) return `Timer ${minutes} Min`;
  const left = remaining(timer, now);
  if (left === 0) return 'Timer abgelaufen';
  const shown = `Timer ${clock(left)}`;
  return timer.startedAt === undefined ? `${shown} · Pause` : shown;
}

/**
 * Running or run-out timers of the other steps, shown on top ("⏱ Schritt 4 · 34:58",
 * "⏱ Schritt 4 · abgelaufen"); a tap goes to the step. Paused ones are left out.
 */
export function otherStepTimers(
  timers: StepTimers,
  currentStepId: Id | undefined,
  now: number,
): { stepId: Id; stepNumber: number; label: string }[] {
  return Object.values(timers)
    .filter((timer) => timer.stepId !== currentStepId)
    .filter((timer) => timer.startedAt !== undefined || remaining(timer, now) === 0)
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((timer) => {
      const left = remaining(timer, now);
      return {
        stepId: timer.stepId,
        stepNumber: timer.stepNumber,
        label: `⏱ Schritt ${timer.stepNumber} · ${left === 0 ? 'abgelaufen' : clock(left)}`,
      };
    });
}

/** Arrow right = "Weiter", arrow left = "Zurück" (AC-044); undefined when nothing moves. */
export function cookingKeyStep(key: string, index: number, count: number): number | undefined {
  if (key === 'ArrowRight' && index < count - 1) return index + 1;
  if (key === 'ArrowLeft' && index > 0) return index - 1;
  return undefined;
}
