import { useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { Platform, Pressable, View, type TextInput } from 'react-native';

import { Button, IconButton, TextField, keyboardFocusRing } from './controls';
import { expandableA11y } from './expandable';
import { List, ListRow } from './lists';
import { Icon, Text } from './primitives';
import { useTheme } from './theme-context';

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

  const createAnyway = () => {
    const [only, ...others] = props.createOptions;
    if (only && others.length === 0) props.onCreate(only.key);
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
        inputRef={props.inputRef}
        returnKeyType="search"
        onSubmitEditing={
          props.enterSelects
            ? () => {
                const first = props.hits[0];
                if (first) props.onSelect(first.key);
              }
            : undefined
        }
        testID={id('input')}
        left={<Icon name="search" size={20} color="muted" />}
        right={
          props.query ? (
            <IconButton
              icon="x"
              label={props.clearLabel}
              size={36}
              onPress={() => props.onQueryChange('')}
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
              onPress={() => props.onSelect(hit.key)}
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
              disabled={disabled || braked}
              onPress={() => props.onCreate(option.key)}
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
                  onPress={props.brake.onAccept}
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
