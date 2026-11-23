// Spec 0022, AC-041: "Reise" is the one term. No file under apps/, packages/, supabase/functions/,
// supabase/tests/, e2e/ or the seeds contains the old words (case ignored).
// Spec 0031, AC-033/AC-034: e2e/ is covered too, and so are the identifiers that earlier specs
// list under "Entfällt". After the migrations are squashed (spec 0028) supabase/migrations/ joins.
//
//   node --test scripts/ci/trip-words.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ROOTS = ['apps', 'packages', 'supabase/functions', 'supabase/tests', 'e2e'];
const FILES = ['supabase/seed.sql', 'supabase/preview-seed.sql'];
const SKIP = new Set([
  'node_modules',
  '.expo',
  'dist',
  '.turbo',
  'coverage',
  'ios',
  'android',
  'test-results',
  'playwright-report',
]);
const BINARY = /\.(png|jpg|jpeg|webp|gif|ico|ttf|otf|woff2?)$/i;

// Assembled, so this file does not find itself.
export const OLD_WORDS = new RegExp(
  ['ab' + 'sence', 'ab' + 'wesen', 'urlaubs' + 'seite'].join('|'),
  'i',
);

/** Identifiers earlier specs dropped ("Entfällt"); case matters, "Starter-Katalog" stays. */
export const DROPPED = new RegExp(
  [
    'not_' + 'cooked', // spec 0020: meal_plan_entries.not_done
    'reservation_' + 'reminder', // spec 0021: entry reminders replace reservation reminders
    'remind_minutes_' + 'before', // spec 0021: plan entries keep one reminder time
    'recipe_' + 'deletions', // spec 0024: private.deletions for every kind
    'Starter' + 'Sheet', // spec 0023: the starter catalogue opens as a page
    'listStarter' + 'Recipes',
    'QUICK_' + 'ADD', // spec 0025
    'parseTime' + 'Input', // spec 0027: TimeField with hour and minute
  ].join('|'),
);

/**
 * Lines that may name an old word, each with its reason: they prove the word is gone.
 * `file` is relative to the repository root, `text` must appear in the line.
 */
const ALLOWED = [
  // Spec 0016, REQ-008: the walk-through checks that the screen shows no old word.
  { file: 'e2e/rundgang-plan.spec.ts', text: 'expectNoAbsenceWord' },
  { file: 'e2e/rundgang-plan.spec.ts', text: 'not.toContainText(/abwesen/i' },
  // Spec 0022, AC-007: the old address ends on "Nicht gefunden".
  { file: 'e2e/rundgang-plan.spec.ts', text: "'/abwesenheiten'" },
  // The dropped columns and functions stay dropped and cannot be written.
  { file: 'supabase/tests/plan_entry_not_done.test.sql', text: 'not_cooked' },
  {
    file: 'supabase/tests/plan_entry_fields.test.sql',
    text: "hasnt_column('public', 'meal_plan_entries', 'remind_minutes_before'",
  },
  {
    file: 'supabase/tests/plan_entry_fields.test.sql',
    text: "hasnt_column('public', 'notification_settings', 'reservation_reminders_enabled'",
  },
  {
    file: 'supabase/tests/plan_entry_fields.test.sql',
    text: "hasnt_function('private', 'reservation_reminder_candidates'",
  },
  { file: 'supabase/tests/plan_entry_fields.test.sql', text: '"remind_minutes_before": 60' },
  { file: 'supabase/tests/notification_scheduler.test.sql', text: 'reservation_reminder' },
  { file: 'supabase/tests/restaurants_and_activities.test.sql', text: 'recipe_deletions' },
  {
    file: 'packages/api/src/db/mapping.test.ts',
    text: "not.toHaveProperty('remind_minutes_before')",
  },
];

function filesUnder(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...filesUnder(full));
    else found.push(full);
  }
  return found;
}

/** "file:line: text" for every line of `files` that matches `pattern` and is not allowed. */
export function hits(files, pattern, allowed = ALLOWED) {
  return files.flatMap((file) => {
    if (BINARY.test(file)) return [];
    const relative = path.relative(root, file);
    return readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) => {
        if (!pattern.test(line)) return [];
        if (allowed.some((entry) => entry.file === relative && line.includes(entry.text)))
          return [];
        return [`${relative}:${index + 1}: ${line.trim()}`];
      });
  });
}

const files = () => [
  ...ROOTS.flatMap((dir) => filesUnder(path.join(root, dir))),
  ...FILES.map((file) => path.join(root, file)),
];

test('AC-041: no old word for a trip in code, tests, functions, e2e and seeds', () => {
  assert.deepEqual(hits(files(), OLD_WORDS), []);
});

test('AC-034 (0031): no identifier an earlier spec dropped', () => {
  assert.deepEqual(hits(files(), DROPPED), []);
});

test('AC-033 (0031): an e2e test name with "absence window" is red, the proofs are allowed', () => {
  assert.ok(ROOTS.includes('e2e'));
  const dir = mkdtempSync(path.join(tmpdir(), 'trip-words-'));
  const file = path.join(dir, 'rundgang.spec.ts');
  writeFileSync(file, `test('AC-021: the ab${'sence'} window names who is chosen', () => {});\n`);
  try {
    assert.equal(hits([file], OLD_WORDS).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const plan = hits([path.join(root, 'e2e/rundgang-plan.spec.ts')], OLD_WORDS);
  assert.deepEqual(
    plan.filter((hit) => /expectNoAbsenceWord|'\/abwesenheiten'/.test(hit)),
    [],
  );
});

test('AC-034 (0031): "Starter-Katalog" and starterCatalog stay allowed', () => {
  assert.equal(DROPPED.test('Starter-Katalog'), false);
  assert.equal(DROPPED.test('const starterCatalog = useStarterCatalog();'), false);
  assert.equal(DROPPED.test('<StarterSheet />'), true);
  assert.equal(DROPPED.test('parseTimeInput("19:30")'), true);
});
