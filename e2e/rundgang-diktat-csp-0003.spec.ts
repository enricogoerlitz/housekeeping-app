import { contentReady, expect, fakeSpeech, open, test, tid } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0003, AC-028 — finding from production (27.11.2026): during dictation the Speech SDK
// started its timer worker from a data: URL, which the build's CSP (`worker-src 'self'`) blocks
// ("Creating a worker from 'data:text/javascript;base64,…' violates …"). The app switches that
// worker off (PropertyId.WebWorkerLoadType), so the CSP stays as strict as it is. The Speech
// service is faked (helpers.ts); the test runs against the production export with its CSP.

const BOLOGNESE = seedIds['rec-spaghetti-bolognese'];

test('spec 0003 AC-028: dictation under the CSP of the build starts no data: worker', async ({
  page,
}) => {
  const blocked: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) blocked.push(message.text());
  });
  // Every worker the page creates, by its address.
  await page.addInitScript(() => {
    const created: string[] = [];
    (window as unknown as { __workers: string[] }).__workers = created;
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        created.push(String(url));
        super(url, options);
      }
    };
  });
  await fakeSpeech(page, 'Mit extra Knoblauch');

  await open(page, `/rezept/${BOLOGNESE}`);
  await contentReady(page);
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-ai-fill-open').click();
  await tid(page, 'recipe-ai-fill-field-text-mic').click();
  await expect(tid(page, 'recipe-ai-fill-field-text')).toHaveValue(/Mit extra Knoblauch/, {
    timeout: 20_000,
  });
  // The SDK throttles the audio after 5 s and then waits with its timers; a busy page makes the
  // audio arrive in bursts, so it has to wait.
  for (let round = 0; round < 8; round += 1) {
    await page.waitForTimeout(1_000);
    await page.evaluate(() => {
      const until = performance.now() + 400;
      while (performance.now() < until) {
        // Busy on purpose.
      }
    });
  }
  await tid(page, 'recipe-ai-fill-field-text-mic').click();
  await expect(tid(page, 'recipe-ai-fill-field-text')).toHaveValue(/Mit extra Knoblauch/);

  const workers = await page.evaluate(
    () => (window as unknown as { __workers: string[] }).__workers,
  );
  expect(workers.filter((url) => url.startsWith('data:'))).toEqual([]);
  expect(blocked).toEqual([]);
});
