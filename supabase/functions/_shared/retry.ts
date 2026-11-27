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

export interface RetryOptions {
  /** Attempts at most (default 3). */
  attempts?: number;
  /** One deadline for all attempts, reading the body included (default 20 s). */
  budgetMs?: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches and reads the body as text. Retries only network errors, 5xx and 429 — by default at
 * most 3 attempts with exponential backoff, all within 20 s including reading the body. Other
 * statuses are returned to the caller.
 */
export async function fetchTextWithRetry(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<{ status: number; text: string }> {
  const attempts = options.attempts ?? ATTEMPTS;
  const budgetMs = options.budgetMs ?? BUDGET_MS;
  const start = Date.now();
  for (let attempt = 1; ; attempt += 1) {
    const remaining = budgetMs - (Date.now() - start);
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
    if (attempt >= attempts || Date.now() - start + backoff >= budgetMs)
      throw new UpstreamUnavailable(status);
    await wait(backoff);
  }
}
