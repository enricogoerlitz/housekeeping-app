import { describe, expect, it } from 'vitest';

import {
  cookingKeyStep,
  otherStepTimers,
  pauseStepTimer,
  resetStepTimer,
  startStepTimer,
  stepTimerLabel,
  timersToRing,
  type StepTimers,
} from './cooking-timers';

const MINUTE = 60_000;

describe('timers of the cooking mode (spec 0023, REQ-010)', () => {
  it('AC-041: a started timer keeps counting when another step is shown', () => {
    let timers: StepTimers = {};
    timers = startStepTimer(timers, { stepId: 's4', stepNumber: 4, minutes: 35 }, 0);
    expect(stepTimerLabel(timers.s4, 35, 2_000)).toBe('Timer 34:58');
    expect(otherStepTimers(timers, 's5', 2_000)).toEqual([
      { stepId: 's4', stepNumber: 4, label: '⏱ Schritt 4 · 34:58' },
    ]);
    expect(otherStepTimers(timers, 's4', 2_000)).toEqual([]);
  });

  it('shows "Timer 35 Min" before the start and "· Pause" when paused', () => {
    expect(stepTimerLabel(undefined, 35, 0)).toBe('Timer 35 Min');
    let timers = startStepTimer({}, { stepId: 's4', stepNumber: 4, minutes: 35 }, 0);
    timers = pauseStepTimer(timers, 's4', 60_000);
    expect(stepTimerLabel(timers.s4, 35, 10 * MINUTE)).toBe('Timer 34:00 · Pause');
    expect(otherStepTimers(timers, 's1', 10 * MINUTE)).toEqual([]);
    timers = startStepTimer(timers, { stepId: 's4', stepNumber: 4, minutes: 35 }, 10 * MINUTE);
    expect(stepTimerLabel(timers.s4, 35, 10 * MINUTE + 1_000)).toBe('Timer 33:59');
  });

  it('runs out: "Timer abgelaufen" and "⏱ Schritt 4 · abgelaufen"', () => {
    const timers = startStepTimer({}, { stepId: 's4', stepNumber: 4, minutes: 1 }, 0);
    expect(stepTimerLabel(timers.s4, 1, 61_000)).toBe('Timer abgelaufen');
    expect(otherStepTimers(timers, 's1', 61_000)).toEqual([
      { stepId: 's4', stepNumber: 4, label: '⏱ Schritt 4 · abgelaufen' },
    ]);
  });

  it('several timers at once, in the order of their steps; reset ends one', () => {
    let timers = startStepTimer({}, { stepId: 's4', stepNumber: 4, minutes: 35 }, 0);
    timers = startStepTimer(timers, { stepId: 's2', stepNumber: 2, minutes: 5 }, 0);
    expect(otherStepTimers(timers, 's1', 0).map((timer) => timer.stepNumber)).toEqual([2, 4]);
    timers = resetStepTimer(timers, 's2');
    expect(Object.keys(timers)).toEqual(['s4']);
  });

  it('shows hours past 60 minutes', () => {
    const timers = startStepTimer({}, { stepId: 's1', stepNumber: 1, minutes: 90 }, 0);
    expect(stepTimerLabel(timers.s1, 90, 0)).toBe('Timer 1:30:00');
  });
});

describe('cookingKeyStep', () => {
  it('AC-044: arrow right and left move one step within the steps', () => {
    expect(cookingKeyStep('ArrowRight', 0, 5)).toBe(1);
    expect(cookingKeyStep('ArrowLeft', 1, 5)).toBe(0);
    expect(cookingKeyStep('ArrowLeft', 0, 5)).toBeUndefined();
    expect(cookingKeyStep('ArrowRight', 4, 5)).toBeUndefined();
    expect(cookingKeyStep('Enter', 1, 5)).toBeUndefined();
  });
});

describe('a run-out timer rings once (spec 0056, REQ-007)', () => {
  const two = startStepTimer({}, { stepId: 's2', stepNumber: 2, minutes: 1 }, 0);

  it('AC-026: the timer of another step rings when it runs out', () => {
    const before = timersToRing(new Set(), two, 59_000);
    expect(before.ring).toEqual([]);
    const after = timersToRing(before.finished, two, 60_000);
    expect(after.ring).toEqual(['s2']);
  });

  it('AC-027: it rings once; after "Zurücksetzen" and a new run-out again', () => {
    const first = timersToRing(new Set(), two, 60_000);
    expect(timersToRing(first.finished, two, 75_000).ring).toEqual([]);
    const reset = resetStepTimer(two, 's2');
    const cleared = timersToRing(first.finished, reset, 80_000);
    expect(cleared.ring).toEqual([]);
    const again = startStepTimer(reset, { stepId: 's2', stepNumber: 2, minutes: 1 }, 80_000);
    expect(timersToRing(cleared.finished, again, 140_000).ring).toEqual(['s2']);
  });

  it('AC-028: a paused timer does not ring', () => {
    const paused = pauseStepTimer(two, 's2', 30_000);
    expect(timersToRing(new Set(), paused, 10 * MINUTE).ring).toEqual([]);
  });
});
