import { useCallback, useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { Platform, Pressable, View, type TextInput } from 'react-native';

import { Button, TextField, keyboardFocusRing } from './controls';
import { FieldClearButton } from './field-clear';
import { expandableA11y } from './expandable';
import { List, ListRow } from './lists';
import { Icon, Text } from './primitives';
import { useTheme } from './theme-context';
import { ariaRef, mergeRefs } from './hint';

export interface SearchOrCreateHit {
  key: string;
  title: string;
  /** Second line, e.g. "auch: Karotten" when a synonym matched. */
  detail?: string;
  /** Short text on the right, e.g. the area "Obst & Gemüse". */
  meta?: string;
}

export interface SearchOrCreateOption {
  key: string;
  /** The whole row text, e.g. "„Paella“ als Rezept anlegen". */
  label: string;
}

export interface SearchOrCreateProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Accessible name of the field. */
  label: string;
  placeholder?: string;
  /** Accessible name of the ✕ that empties the field. */
  clearLabel: string;
  hits: SearchOrCreateHit[];
  onSelect: (key: string) => void;
  /** One row per kind that can be created; empty when the query names an existing entry. */
  createOptions: SearchOrCreateOption[];
  onCreate: (key: string) => void;
  /**
   * "Meinst du …?" for a look-alike: the create rows wait until the user picks "Ja" (the
   * look-alike) or "Trotzdem neu".
   */
  brake?: {
    question: string;
    acceptLabel: string;
    createAnywayLabel: string;
    onAccept: () => void;
  };
  /** Creating is not possible now (e.g. offline); the rows are greyed out with this reason. */
  createDisabledHint?: string;
  /** "Mehr Angaben ▸": more fields that unfold in place, below the rows. */
  more?: { label: string; children: ReactNode };
  autoFocus?: boolean;
  /** Enter in the field takes the first hit, e.g. the article of an ingredient (spec 0023, AC-001). */
  enterSelects?: boolean;
  /** Enter in the field, decided by the caller (e.g. take the exact value or create it). */
  onSubmit?: () => void;
  /**
   * After a pick, a create or Enter the cursor goes back into the field, so the next value can be
   * typed at once (spec 0036, AC-006).
   */
  keepFocus?: boolean;
  /** The search field, e.g. to put the focus back on it (spec 0023, AC-003). */
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
  /** Parts get `${testID}-input`, `-hit-<key>`, `-create-<key>`, `-brake`, `-more`. */
  testID?: string;
}

/**
 * "Suchen oder anlegen" (spec 0005, REQ-006): a search field with hits and, below them, one
 * "neu anlegen" row per kind. Which hits, which kinds and whether to brake come from the caller
 * (the matching rule is `matchSearchOrCreate` in @housekeeping/core); this block only shows them.
 */
export function SearchOrCreate(props: SearchOrCreateProps) {
  const theme = useTheme();
  const [overruled, setOverruled] = useState<string | undefined>(undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  const id = (part: string) => (props.testID ? `${props.testID}-${part}` : undefined);
  // "Trotzdem neu" with several kinds unlocks the rows, but only for the query it was given for.
  const braked = props.brake !== undefined && overruled !== props.query;
  const disabled = props.createDisabledHint !== undefined;
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // The field for the focus here and, when given, for the caller too.
  const { inputRef } = props;
  const setInput = useCallback(
    (node: ComponentRef<typeof TextInput> | null) => {
      input.current = node;
      mergeRefs(inputRef)(node);
    },
    [inputRef],
  );
  const refocus = () => {
    if (props.keepFocus) input.current?.focus();
  };
  const select = (key: string) => {
    props.onSelect(key);
    refocus();
  };
  const create = (key: string) => {
    props.onCreate(key);
    refocus();
  };
  const submit = () => {
    if (props.onSubmit) props.onSubmit();
    else if (props.enterSelects && props.hits[0]) props.onSelect(props.hits[0].key);
    else return;
    refocus();
  };

  const createAnyway = () => {
    const [only, ...others] = props.createOptions;
    if (only && others.length === 0) create(only.key);
    else setOverruled(props.query);
  };

  return (
    <View testID={props.testID} style={{ gap: 10 }}>
      <TextField
        round
        value={props.query}
        onChangeText={props.onQueryChange}
        placeholder={props.placeholder}
        accessibilityLabel={props.label}
        autoFocus={props.autoFocus}
        inputRef={setInput}
        returnKeyType="search"
        // Enter searches here; it never saves the window around it (spec 0036, AC-026).
        submitsWindow={false}
        onSubmitEditing={props.onSubmit || props.enterSelects ? submit : undefined}
        // Enter would otherwise blur the field after taking the value (spec 0036, AC-007).
        blurOnSubmit={props.keepFocus ? false : undefined}
        testID={id('input')}
        left={<Icon name="search" size={20} color="muted" />}
        right={
          props.query ? (
            <FieldClearButton
              label={props.clearLabel}
              size={36}
              onClear={() => props.onQueryChange('')}
              inputRef={input}
              testID={id('clear')}
            />
          ) : undefined
        }
      />
      {props.hits.length > 0 ? (
        <List testID={id('hits')}>
          {props.hits.map((hit) => (
            <ListRow
              key={hit.key}
              title={hit.title}
              subtitle={hit.detail}
              trailing={
                hit.meta ? (
                  <Text variant="small" color="muted">
                    {hit.meta}
                  </Text>
                ) : undefined
              }
              onPress={() => select(hit.key)}
              testID={id(`hit-${hit.key}`)}
            />
          ))}
        </List>
      ) : null}
      {props.createOptions.length > 0 ? (
        <View style={{ gap: 4 }}>
          {props.createOptions.map((option) => (
            <Pressable
              key={option.key}
              testID={id(`create-${option.key}`)}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityHint={disabled ? props.createDisabledHint : undefined}
              accessibilityState={{ disabled: disabled || braked }}
              // react-native-web drops accessibilityHint.
              ref={ariaRef({
                'aria-description': disabled ? props.createDisabledHint : undefined,
              })}
              disabled={disabled || braked}
              onPress={() => create(option.key)}
              style={(state) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 48,
                  paddingHorizontal: 4,
                  borderRadius: theme.shape.radius.control,
                  opacity: disabled ? 0.45 : state.pressed ? 0.6 : 1,
                },
                keyboardFocusRing(theme, (state as { focused?: boolean }).focused),
              ]}
            >
              <Icon name="plus" size={20} color="accent" />
              <Text variant="bodyStrong" color="accent" style={{ flexShrink: 1 }}>
                {option.label}
              </Text>
            </Pressable>
          ))}
          {braked && props.brake && !disabled ? (
            <View
              testID={id('brake')}
              accessibilityRole="alert"
              style={{
                gap: 10,
                padding: 12,
                borderRadius: theme.shape.radius.control,
                backgroundColor: theme.colors.surfaceSunken,
              }}
            >
              <Text variant="bodyStrong">{props.brake.question}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button
                  label={props.brake.acceptLabel}
                  size="sm"
                  onPress={() => {
                    props.brake?.onAccept();
                    refocus();
                  }}
                  testID={id('brake-accept')}
                />
                <Button
                  label={props.brake.createAnywayLabel}
                  size="sm"
                  variant="ghost"
                  onPress={createAnyway}
                  testID={id('brake-create')}
                />
              </View>
            </View>
          ) : null}
          {disabled ? (
            <Text variant="small" color="warn" testID={id('create-hint')}>
              {props.createDisabledHint}
            </Text>
          ) : null}
        </View>
      ) : null}
      {props.more ? (
        <View>
          <Pressable
            testID={id('more')}
            accessibilityRole="button"
            {...expandableA11y(props.more.label, moreOpen, Platform.OS)}
            onPress={() => setMoreOpen(!moreOpen)}
            style={(state) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                minHeight: 44,
                borderRadius: 6,
                alignSelf: 'flex-start',
                opacity: state.pressed ? 0.6 : 1,
              },
              keyboardFocusRing(theme, (state as { focused?: boolean }).focused),
            ]}
          >
            <Text variant="smallStrong" color="accent">
              {props.more.label}
            </Text>
            <Icon name={moreOpen ? 'chevron-down' : 'chevron-right'} size={16} color="accent" />
          </Pressable>
          {moreOpen ? <View style={{ gap: 12, paddingTop: 4 }}>{props.more.children}</View> : null}
        </View>
      ) : null}
    </View>
  );
}
