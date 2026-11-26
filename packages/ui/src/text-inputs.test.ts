import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Review 0003, N-1: iOS must never offer "Kontakt autom. ausfüllen" (spec 0033, REQ-005). Only
// `TextField` (controls.tsx) gives a field the attributes against it, so every text input of the
// app has to be a `TextField`: no raw `TextInput`, `<input>` or `<textarea>` anywhere else.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROOTS = ['packages/ui/src', 'apps/app/src'];

function sources(dir: string): string[] {
  return readdirSync(path.join(repo, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(relative);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [relative];
  });
}

describe('text inputs (spec 0033, REQ-005)', () => {
  it('AC-014: every text field of the app is a TextField', () => {
    const raw = ROOTS.flatMap(sources).filter((file) =>
      /<TextInput\b|<input\b|<textarea\b|createElement\(['"](input|textarea)['"]\)/.test(
        readFileSync(path.join(repo, file), 'utf8'),
      ),
    );
    // The photo picker's input is a file input: no text, no keyboard.
    expect(raw.sort()).toEqual([
      'packages/ui/src/controls.tsx',
      'packages/ui/src/pick-image.web.ts',
    ]);
  });
});
