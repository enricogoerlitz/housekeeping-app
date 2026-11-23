import { useArticles } from '@housekeeping/api';
import type { IngredientRow } from '@housekeeping/core';
import { Sheet, TextField } from '@housekeeping/ui';
import { useState } from 'react';

import { rowsFromText } from './sections/ingredient-handover';

/**
 * "Mehrere einfügen" in the open section "Zutaten" (spec 0007, REQ-002; spec 0008, E9): a block,
 * one ingredient per line, becomes rows of the draft. A line whose name or synonym fits exactly
 * has its article; the others stand orange in the section with "Meinst du …?", "„…“ neu anlegen"
 * or "Artikel wählen" (AC-008, AC-009). Nothing is saved here; "Fertig" saves (AC-032).
 */
export function IngredientsPasteSheet(props: {
  onPaste: (rows: IngredientRow[]) => void;
  onClose: () => void;
}) {
  const articles = useArticles();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();

  const paste = () => {
    if (!text.trim()) {
      setError('Füge mindestens eine Zutat ein.');
      return;
    }
    const rows = rowsFromText(text, articles);
    if (rows.length === 0) {
      setError('Darin war keine Zutat zu erkennen.');
      return;
    }
    props.onPaste(rows);
  };

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title="Zutaten einfügen"
      testID="ingredients-paste-sheet"
      size="m"
      actions={{
        primary: {
          label: 'Einfügen',
          icon: 'check',
          onPress: paste,
          testID: 'ingredients-paste-save',
        },
      }}
    >
      <TextField
        label="Zutaten"
        placeholder={'200 ml Kokosmilch\n1 Mango\n1 Prise Salz'}
        hint="Eine Zutat pro Zeile, z. B. 200 ml Kokosmilch"
        value={text}
        onChangeText={(value) => {
          setText(value);
          if (error) setError(undefined);
        }}
        multiline
        autoFocus
        error={error}
        testID="ingredients-paste"
      />
    </Sheet>
  );
}
