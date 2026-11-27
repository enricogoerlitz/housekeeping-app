import { suggestedCreatePath, WEB_SEARCH_LIMITS, type CreatePath } from '@housekeeping/core';
import { PathButtons, Stack, type PathButtonOption } from '@housekeeping/ui';
import { type ComponentRef, type Ref } from 'react';
import { Keyboard, type TextInput } from 'react-native';

import { DictationField } from '@/features/shell/dictation-field';
import { useOnlineOnly } from '@/features/shell/offline';

import type { WebSearch } from './use-web-search';
import { WebSearchPanel, type RecipeRows } from './web-search-panel';

// "Ein Feld, drei Wege" (spec 0062, REQ-001 – REQ-004, REQ-008): one field, the same ways under it
// and the web search's cards in the same window. The way the text suggests is highlighted and
// taken by Return; a web search starts only on a tap or Return, never while typing.

const LABELS: Record<CreatePath, PathButtonOption<CreatePath>> = {
  create: { value: 'create', label: 'Anlegen', icon: 'plus' },
  web: { value: 'web', label: 'Websuche', icon: 'globe' },
  ai: { value: 'ai', label: 'KI-Rezept', icon: 'sparkles' },
};

/** The Return key names what it does (spec 0062, REQ-002). */
const RETURN_KEYS = { create: 'done', web: 'search', ai: 'go' } as const;

const SUGGESTED_HINT = 'Vorgeschlagen – die Eingabetaste wählt diesen Weg';

export function OneFieldCreate(props: {
  text: string;
  onChangeText: (text: string) => void;
  paths: readonly CreatePath[];
  /** "Anlegen" and "KI-Rezept"; "Websuche" searches the text here. */
  onPath: (path: Exclude<CreatePath, 'web'>) => void;
  search: WebSearch;
  label: string;
  placeholder: string;
  /** While the AI writes: the field and the ways wait. */
  busy?: boolean;
  error?: string;
  recipeRows?: RecipeRows;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
  maxLength?: number;
  /** Test IDs the window had before (e.g. "new-recipe-title", "new-recipe-save"). */
  testIDs?: Partial<Record<CreatePath | 'field', string>>;
  /** Places: "Anlegen" without a name shows the empty form (spec 0062, REQ-008). */
  createWhenEmpty?: boolean;
  testID: string;
}) {
  const online = useOnlineOnly();
  const { search, testID } = props;
  const suggested = suggestedCreatePath(props.text, props.paths);
  const empty = props.text.trim() === '';
  const ready = (path: CreatePath) =>
    !empty || (path === 'create' && props.createWhenEmpty === true);
  const take = (path: CreatePath) => {
    if (online.disabled || props.busy || !ready(path)) return;
    if (path !== 'web') {
      props.onPath(path);
      return;
    }
    // REQ-004: the keyboard goes, the cards take its place.
    Keyboard.dismiss();
    search.search(props.text.trim().slice(0, WEB_SEARCH_LIMITS.query));
  };
  const searched = search.state.status !== 'idle' || search.preview !== undefined;
  return (
    <Stack gap={12}>
      <DictationField
        accessibilityLabel={props.label}
        placeholder={props.placeholder}
        value={props.text}
        onChangeText={props.onChangeText}
        onSubmitEditing={() => {
          if (suggested) take(suggested);
        }}
        returnKeyType={suggested ? RETURN_KEYS[suggested] : 'done'}
        submitsWindow={false}
        autoFocus
        inputRef={props.inputRef}
        editable={!online.disabled && !props.busy}
        maxLength={props.maxLength}
        error={props.error}
        testID={props.testIDs?.field ?? `${testID}-text`}
      />
      <PathButtons
        options={props.paths.map((path) => ({
          ...LABELS[path],
          disabled: !ready(path),
          testID: props.testIDs?.[path],
        }))}
        highlighted={suggested}
        highlightHint={SUGGESTED_HINT}
        onPress={take}
        disabled={online.disabled || props.busy}
        hint={online.hint}
        testID={`${testID}-path`}
      />
      {searched ? (
        <WebSearchPanel
          search={search}
          recipeRows={props.recipeRows}
          withField={false}
          testID={`${testID}-web`}
        />
      ) : null}
    </Stack>
  );
}
