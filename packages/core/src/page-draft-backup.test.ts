import { describe, expect, it } from 'vitest';

import { pageDraft, withSection } from './page-editor';
import {
  decodePageDraftBackup,
  encodePageDraftBackup,
  pageDraftBackupKey,
  pageDraftBackupNotice,
} from './page-draft-backup';
import { grillabend, makeRecipe } from './test-fixtures';

// Spec 0056, REQ-006: the edit mode's draft survives back, a tab change and a reload.

const lasagne = makeRecipe({
  id: 'rec-lasagne',
  title: 'Lasagne',
  updatedAt: '2026-11-27T08:00:00Z',
});
const page = pageDraft(lasagne, []);
const edited = withSection(page, { ...page.head, title: 'Omas Lasagne' });
const at = new Date(2026, 10, 27, 17, 42).toISOString();

describe('the backup of a recipe draft (spec 0056, REQ-006)', () => {
  it('AC-019: a draft comes back as it was, with the time it was kept', () => {
    const raw = encodePageDraftBackup(edited, at);
    const back = decodePageDraftBackup(raw, 'rec-lasagne');
    expect(back?.draft.head.title).toBe('Omas Lasagne');
    expect(back?.draft.head.base.title).toBe('Lasagne');
    // The base stays, so saving later sends only what changed (AC-025).
    expect(back?.draft.seenUpdatedAt).toBe('2026-11-27T08:00:00Z');
    expect(back?.savedAt).toBe(at);
  });

  it('AC-019: a collection keeps its "Enthält"', () => {
    const collection = pageDraft(grillabend, []);
    const back = decodePageDraftBackup(encodePageDraftBackup(collection, at), grillabend.id);
    expect(back?.draft.contents?.section).toBe('contents');
  });

  it('AC-024: nothing, broken text, another recipe or a wrong shape give nothing', () => {
    const raw = encodePageDraftBackup(edited, at);
    expect(decodePageDraftBackup(null, 'rec-lasagne')).toBeUndefined();
    expect(decodePageDraftBackup('{kaputt', 'rec-lasagne')).toBeUndefined();
    expect(decodePageDraftBackup(raw, 'rec-other')).toBeUndefined();
    const shapeless = JSON.stringify({ savedAt: at, draft: { recipeId: 'rec-lasagne' } });
    expect(decodePageDraftBackup(shapeless, 'rec-lasagne')).toBeUndefined();
    expect(decodePageDraftBackup(JSON.stringify({ draft: edited }), 'rec-lasagne')).toBeUndefined();
  });

  it('AC-019: the key names the recipe', () => {
    expect(pageDraftBackupKey('rec-lasagne')).toBe('housekeeping.recipe-draft.rec-lasagne');
  });

  it('AC-019: the notice says the time, on another day also the date', () => {
    const now = new Date(2026, 10, 27, 18, 5);
    expect(pageDraftBackupNotice(at, now)).toBe('Ungespeicherte Änderungen von 17:42');
    const yesterday = new Date(2026, 10, 26, 9, 7).toISOString();
    expect(pageDraftBackupNotice(yesterday, now)).toBe(
      'Ungespeicherte Änderungen vom 26.11. um 09:07',
    );
  });
});
