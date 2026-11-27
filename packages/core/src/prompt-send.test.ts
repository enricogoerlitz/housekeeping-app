import { describe, expect, it } from 'vitest';

import {
  DICTATION_FINALIZE_MS,
  finalizeDictation,
  promptSendStep,
  type PromptSendPhase,
  type StartTimer,
} from './prompt-send';

/** A stop that resolves or rejects only when the test says so. */
function pendingStop() {
  let resolve: (text: string) => void = () => {};
  let reject: (cause: unknown) => void = () => {};
  const promise = new Promise<string>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** A fake clock: `advance` moves time on and runs the timers that are due. */
function fakeClock() {
  let now = 0;
  const timers: { at: number; run: () => void; live: boolean }[] = [];
  const start: StartTimer = (run, ms) => {
    const timer = { at: now + ms, run, live: true };
    timers.push(timer);
    return () => {
      timer.live = false;
    };
  };
  const advance = async (ms: number) => {
    now += ms;
    for (const timer of timers) {
      if (timer.live && timer.at <= now) {
        timer.live = false;
        timer.run();
      }
    }
    // Let the promise callbacks run.
    await Promise.resolve();
    await Promise.resolve();
  };
  return { start, advance, live: () => timers.filter((timer) => timer.live).length };
}

describe('finalizeDictation', () => {
  it('AC-001: takes the final result of the last phrase when it comes in time', async () => {
    const clock = fakeClock();
    const stop = pendingStop();
    const done = finalizeDictation(stop.promise, () => 'Omas Apfelkuchen', clock.start);
    await clock.advance(400);
    stop.resolve('Omas Apfelkuchen mit Streuseln');
    await expect(done).resolves.toEqual({
      text: 'Omas Apfelkuchen mit Streuseln',
      outcome: 'final',
    });
  });

  it('AC-003: after 1.5 s it uses what was shown so far, interim words included', async () => {
    const clock = fakeClock();
    const stop = pendingStop();
    let shown = 'Linsen';
    let settled = false;
    const done = finalizeDictation(stop.promise, () => shown, clock.start);
    void done.then(() => {
      settled = true;
    });
    shown = 'Linsen statt';
    await clock.advance(DICTATION_FINALIZE_MS - 1);
    expect(settled).toBe(false);
    await clock.advance(1);
    await expect(done).resolves.toEqual({ text: 'Linsen statt', outcome: 'timeout' });
  });

  it('AC-003: a final result after the timeout changes nothing', async () => {
    const clock = fakeClock();
    const stop = pendingStop();
    const done = finalizeDictation(stop.promise, () => 'Linsen statt', clock.start);
    await clock.advance(DICTATION_FINALIZE_MS);
    stop.resolve('Linsen statt Tofu');
    await expect(done).resolves.toEqual({ text: 'Linsen statt', outcome: 'timeout' });
  });

  it('AC-007: a broken-off recognition sends what was shown and says so', async () => {
    const clock = fakeClock();
    const stop = pendingStop();
    const done = finalizeDictation(stop.promise, () => 'Linsen statt', clock.start);
    stop.reject(new Error('connection lost'));
    await expect(done).resolves.toEqual({ text: 'Linsen statt', outcome: 'failed' });
  });

  it('cancels its timer once the final result is there', async () => {
    const clock = fakeClock();
    const stop = pendingStop();
    const done = finalizeDictation(stop.promise, () => '', clock.start);
    expect(clock.live()).toBe(1);
    stop.resolve('Pizzateig mit Hefe');
    await done;
    expect(clock.live()).toBe(0);
  });

  it('keeps a custom wait', async () => {
    const clock = fakeClock();
    const stop = pendingStop();
    const done = finalizeDictation(stop.promise, () => 'kurz', clock.start, 200);
    await clock.advance(199);
    await clock.advance(1);
    await expect(done).resolves.toEqual({ text: 'kurz', outcome: 'timeout' });
  });
});

describe('promptSendStep', () => {
  it('sends at once when no dictation runs (as before)', () => {
    expect(promptSendStep('ready', { type: 'press', dictation: 'idle' })).toEqual({
      phase: 'ready',
      effect: 'send',
    });
  });

  it('AC-001: send while listening finalizes first', () => {
    expect(promptSendStep('ready', { type: 'press', dictation: 'listening' })).toEqual({
      phase: 'finalizing',
      effect: 'finalize',
    });
  });

  it('AC-016: send while the mic is already finishing waits for that same result', () => {
    expect(promptSendStep('ready', { type: 'press', dictation: 'stopping' })).toEqual({
      phase: 'finalizing',
      effect: 'finalize',
    });
  });

  it('AC-009: send while the mic is still starting drops the start and sends the field', () => {
    expect(promptSendStep('ready', { type: 'press', dictation: 'starting' })).toEqual({
      phase: 'ready',
      effect: 'abandon-start-and-send',
    });
  });

  it('AC-001, AC-004: the finished text is sent after it is in the field', () => {
    expect(promptSendStep('finalizing', { type: 'finished', text: 'Pizzateig mit Hefe' })).toEqual({
      phase: 'queued',
      effect: 'send-after-commit',
    });
    expect(promptSendStep('queued', { type: 'sent' })).toEqual({ phase: 'ready', effect: 'none' });
  });

  it('AC-005: nothing heard and nothing typed sends nothing', () => {
    expect(promptSendStep('finalizing', { type: 'finished', text: '  ' })).toEqual({
      phase: 'ready',
      effect: 'nothing-heard',
    });
  });

  it('AC-006: further presses while finalizing or queued are ignored', () => {
    const phases: PromptSendPhase[] = ['finalizing', 'queued'];
    for (const phase of phases) {
      for (const dictation of ['idle', 'starting', 'listening', 'stopping'] as const) {
        expect(promptSendStep(phase, { type: 'press', dictation })).toEqual({
          phase,
          effect: 'none',
        });
      }
    }
  });

  it('AC-006: a whole double tap sends exactly once', () => {
    let phase: PromptSendPhase = 'ready';
    const effects: string[] = [];
    const run = (event: Parameters<typeof promptSendStep>[1]) => {
      const next = promptSendStep(phase, event);
      phase = next.phase;
      effects.push(next.effect);
    };
    run({ type: 'press', dictation: 'listening' });
    run({ type: 'press', dictation: 'stopping' });
    run({ type: 'finished', text: 'Linsen statt Tofu' });
    run({ type: 'press', dictation: 'idle' });
    run({ type: 'sent' });
    expect(effects.filter((effect) => effect.includes('send'))).toEqual(['send-after-commit']);
    expect(phase).toBe('ready');
  });

  it('AC-008: cancel drops a waiting send, and a late result does nothing', () => {
    expect(promptSendStep('finalizing', { type: 'cancel' })).toEqual({
      phase: 'ready',
      effect: 'none',
    });
    expect(promptSendStep('queued', { type: 'cancel' })).toEqual({
      phase: 'ready',
      effect: 'none',
    });
    expect(promptSendStep('ready', { type: 'finished', text: 'Linsen' })).toEqual({
      phase: 'ready',
      effect: 'none',
    });
    expect(promptSendStep('ready', { type: 'sent' })).toEqual({ phase: 'ready', effect: 'none' });
  });
});
