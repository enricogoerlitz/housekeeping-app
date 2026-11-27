// The sound of a run-out timer in the cooking mode (spec 0056, REQ-007, Entscheidung 8): three
// short tones made with Web Audio, no audio file. Browsers (iOS above all) play Web Audio only
// after a gesture, so the tap that starts a timer calls `unlockChime`. Vibration where the
// device can (Android; iOS Safari cannot). Without either the cooking mode runs on silently.

type AudioContextClass = new () => AudioContext;

let context: AudioContext | undefined;

function audioClass(): AudioContextClass | undefined {
  const scope = globalThis as {
    AudioContext?: AudioContextClass;
    webkitAudioContext?: AudioContextClass;
  };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

/** Called from the tap that starts a timer: creates or wakes the audio context. */
export function unlockChime(): void {
  try {
    const Audio = audioClass();
    if (!Audio) return;
    context ??= new Audio();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    // A silent tone in the gesture keeps older iOS versions unlocked.
    tone(context, context.currentTime, 0.01, 0);
  } catch {
    context = undefined;
  }
}

function tone(audio: AudioContext, at: number, seconds: number, volume: number): void {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.01);
  gain.gain.linearRampToValueAtTime(0, at + seconds);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + seconds + 0.02);
}

/** A timer ran out: three short tones and a vibration, each where the device allows it. */
export function ringChime(): void {
  try {
    if (context && context.state !== 'closed') {
      const start = context.currentTime + 0.02;
      for (const at of [0, 0.3, 0.6]) tone(context, start + at, 0.18, 0.3);
    }
  } catch {
    // No sound: the chip still says "Timer abgelaufen".
  }
  try {
    const vibrate = (
      globalThis.navigator as { vibrate?: (pattern: number[]) => boolean } | undefined
    )?.vibrate;
    vibrate?.call(globalThis.navigator, [200, 100, 200, 100, 200]);
  } catch {
    // No vibration.
  }
}
