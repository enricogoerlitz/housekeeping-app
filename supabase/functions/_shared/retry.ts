const ATTEMPTS = 3;
const BUDGET_MS = 20_000;
const BACKOFF_MS = 500;

/** The upstream service did not answer usably within the attempts and the time budget. */
export class UpstreamUnavailable extends Error {
  constructor(readonly status?: number) {
    super('upstream unavailable');
    this.name = 'UpstreamUnavailable';
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches and reads the body as text. Retries only network errors, 5xx and 429 — at most 3
 * attempts with exponential backoff, all within 20 s including reading the body. Other statuses
 * are returned to the caller.
 */
export async function fetchTextWithRetry(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<{ status: number; text: string }> {
  const start = Date.now();
  for (let attempt = 1; ; attempt += 1) {
    const remaining = BUDGET_MS - (Date.now() - start);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let status: number | undefined;
    try {
      const response = await fetchFn(url, { ...init, signal: controller.signal });
      status = response.status;
      const text = await response.text();
      if (status < 500 && status !== 429) return { status, text };
    } catch {
      // Network error or timeout: retried below while attempts and time remain.
    } finally {
      clearTimeout(timer);
    }
    const backoff = BACKOFF_MS * 2 ** (attempt - 1);
    if (attempt >= ATTEMPTS || Date.now() - start + backoff >= BUDGET_MS)
      throw new UpstreamUnavailable(status);
    await wait(backoff);
  }
}
