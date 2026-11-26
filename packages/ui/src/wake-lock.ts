interface Sentinel {
  release: () => Promise<void>;
}

/** The parts of the browser the Screen Wake Lock needs; passed in so the logic runs in Node. */
export interface WakeLockEnvironment {
  wakeLock?: { request: (type: 'screen') => Promise<Sentinel> };
  isVisible: () => boolean;
  addVisibilityListener: (listener: () => void) => void;
  removeVisibilityListener: (listener: () => void) => void;
}

/**
 * Keeps the screen on until the returned release is called: asks for the Screen Wake Lock now
 * and again whenever the page becomes visible (the browser drops it in the background; installed
 * iOS apps have it from iOS 18.4, spec 0034, REQ-010). Without it, or when refused, nothing
 * happens and nothing is said.
 */
export function holdWakeLock(env: WakeLockEnvironment): () => void {
  const api = env.wakeLock;
  if (!api) return () => undefined;
  let sentinel: Sentinel | undefined;
  let active = true;
  const request = () => {
    if (!env.isVisible()) return;
    api
      .request('screen')
      .then((lock) => {
        if (active) sentinel = lock;
        else void lock.release().catch(() => undefined);
      })
      .catch(() => undefined);
  };
  request();
  env.addVisibilityListener(request);
  return () => {
    active = false;
    env.removeVisibilityListener(request);
    void sentinel?.release().catch(() => undefined);
  };
}
