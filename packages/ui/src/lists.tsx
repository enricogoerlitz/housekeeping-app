import { Children, createContext, isValidElement, useContext, type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { Checkbox, IconButton, focusRing } from './controls';
import { Surface, Text } from './primitives';
import { ToneContext, useTheme } from './theme-context';
import type { Tone } from './themes';

export interface SectionProps {
  title?: string;
  /** Short text on the right of the title, e.g. "ca. 4 Punkte". */
  meta?: string;
  /**
   * @deprecated No theme paints sections any more (spec 0005, D4: one area colour per screen, set
   * by `Screen`'s `tone`). Ignored; remove it when touching the screen.
   */
  tone?: Tone;
  /** Element on the right of the title instead of `meta`, e.g. a small button. */
  action?: ReactNode;
  children?: ReactNode;
  testID?: string;
}

/** A titled block of a screen. Framing differs per theme; content is the same. */
export function Section(props: SectionProps) {
  const theme = useTheme();
  const { section } = theme.shape;

  const header =
    props.title || props.meta || props.action ? (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: section === 'grouped' ? 7 : 10,
          paddingHorizontal: section === 'grouped' ? 14 : 0,
        }}
      >
        {props.title ? (
          <Text
            heading
            variant={section === 'grouped' ? 'sectionLabel' : 'heading'}
            color={section === 'grouped' ? 'muted' : 'text'}
            style={{ flexShrink: 1 }}
          >
            {props.title}
          </Text>
        ) : (
          <View />
        )}
        {props.action ??
          (props.meta ? (
            <Text variant="small" color="muted">
              {props.meta}
            </Text>
          ) : null)}
      </View>
    ) : null;

  return (
    <View testID={props.testID} style={{ marginBottom: 22 }}>
      {header}
      {props.children}
    </View>
  );
}

/** A small heading inside a list screen, e.g. a supermarket area. */
export function GroupLabel(props: { children: string; testID?: string }) {
  const theme = useTheme();
  const grouped = theme.shape.list === 'grouped';
  return (
    <Text
      heading
      testID={props.testID}
      variant="groupLabel"
      color={grouped ? 'muted' : 'text'}
      style={{ marginTop: 16, marginBottom: grouped ? 6 : 4, paddingHorizontal: grouped ? 14 : 0 }}
    >
      {props.children}
    </Text>
  );
}

const RowIndexContext = createContext(0);

export interface ListProps {
  children?: ReactNode;
  testID?: string;
}

/** Container for ListRow, CheckRow and GhostRow. Separates rows the way the theme asks for. */
export function List(props: ListProps) {
  const theme = useTheme();
  const rows = Children.toArray(props.children).map((child, index) => (
    // The child's own key keeps a row's identity when rows before it leave (RowTransition).
    <RowIndexContext.Provider key={isValidElement(child) ? child.key : index} value={index}>
      {child}
    </RowIndexContext.Provider>
  ));
  if (rows.length === 0) return null;
  if (theme.shape.list === 'grouped') {
    return (
      <Surface testID={props.testID} padding={0} style={{ overflow: 'hidden' }}>
        {rows}
      </Surface>
    );
  }
  return (
    <View testID={props.testID} style={{ gap: theme.shape.list === 'tile' ? 8 : 0 }}>
      {rows}
    </View>
  );
}

export interface ListRowProps {
  title: ReactNode;
  /** "Zusatz": shown muted in parentheses behind the title. */
  note?: string;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  strike?: boolean;
  /** Accessible name when the title is not a plain string. */
  accessibilityLabel?: string;
  testID?: string;
}

export function ListRow(props: ListRowProps) {
  const theme = useTheme();
  const index = useContext(RowIndexContext);
  const insideTone = useContext(ToneContext) !== undefined;
  const { list } = theme.shape;
  const c = theme.colors;

  const content = (
    <>
      {props.leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof props.title === 'string' ? (
          <Text variant="rowTitle" color={props.strike ? 'muted' : 'text'} strike={props.strike}>
            {props.title}
            {props.note ? (
              <Text variant="body" color="muted">
                {' '}
                ({props.note})
              </Text>
            ) : null}
          </Text>
        ) : (
          props.title
        )}
        {typeof props.subtitle === 'string' ? (
          <Text variant="small" color="muted" style={{ marginTop: 1 }}>
            {props.subtitle}
          </Text>
        ) : (
          props.subtitle
        )}
      </View>
      {props.trailing}
    </>
  );

  const layout: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: list === 'hairline' ? 0 : 14,
  };
  const frame: ViewStyle =
    list === 'tile'
      ? {
          backgroundColor: c.surface,
          borderRadius: theme.shape.radius.card - 4,
          // On the plain page background a white tile needs an edge; on a tone tile it does not.
          borderWidth: insideTone ? 0 : 1,
          borderColor: c.border,
        }
      : index > 0
        ? { borderTopWidth: 1, borderTopColor: c.border }
        : {};

  // A tile is a surface of its own: text on it must not inherit the tone colour.
  const wrap = (node: ReactNode) =>
    list === 'tile' ? <ToneContext.Provider value={undefined}>{node}</ToneContext.Provider> : node;

  if (props.onPress) {
    return wrap(
      <Pressable
        testID={props.testID}
        accessibilityRole="button"
        accessibilityLabel={
          props.accessibilityLabel ?? (typeof props.title === 'string' ? props.title : undefined)
        }
        accessibilityState={{ disabled: !!props.disabled }}
        disabled={props.disabled}
        onPress={props.onPress}
        style={(state) => [
          layout,
          frame,
          { opacity: props.disabled ? 0.45 : state.pressed ? 0.6 : 1 },
          focusRing(theme, (state as { focused?: boolean }).focused),
        ]}
      >
        {content}
      </Pressable>,
    );
  }
  return wrap(
    <View testID={props.testID} style={[layout, frame, props.disabled ? { opacity: 0.45 } : null]}>
      {content}
    </View>,
  );
}

export interface CheckRowProps {
  title: string;
  note?: string;
  subtitle?: ReactNode;
  checked: boolean;
  onToggle?: () => void;
  trailing?: ReactNode;
  disabled?: boolean;
  /** Opens details; the checkbox still toggles on its own. */
  onPress?: () => void;
  testID?: string;
}

/** A row with a checkbox: shopping items, chores, selectable options. */
export function CheckRow(props: CheckRowProps) {
  return (
    <ListRow
      testID={props.testID}
      title={props.title}
      note={props.note}
      subtitle={props.subtitle}
      strike={props.checked}
      disabled={props.disabled}
      onPress={props.onPress}
      trailing={props.trailing}
      leading={
        <Checkbox
          testID={props.testID ? `${props.testID}-check` : undefined}
          label={props.title}
          checked={props.checked}
          disabled={props.disabled}
          onChange={props.onToggle ? () => props.onToggle?.() : undefined}
        />
      }
    />
  );
}

export interface GhostRowProps {
  title: string;
  note?: string;
  /** Short text on the right, e.g. "6×". */
  meta?: string;
  onAccept: () => void;
  onDiscard: () => void;
  testID?: string;
}

/** A proposal shown in place ("Vorschlagszeile"): dashed, with accept and discard. */
export function GhostRow(props: GhostRowProps) {
  const theme = useTheme();
  return (
    <ToneContext.Provider value={undefined}>
      <View
        testID={props.testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minHeight: 56,
          paddingLeft: 14,
          paddingRight: 6,
          marginVertical: 3,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: theme.colors.textMuted,
          borderRadius: theme.shape.radius.control,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="rowTitle">
            {props.title}
            {props.note ? (
              <Text variant="body" color="muted">
                {' '}
                ({props.note})
              </Text>
            ) : null}
          </Text>
        </View>
        {props.meta ? (
          <Text variant="body" color="muted">
            {props.meta}
          </Text>
        ) : null}
        <IconButton
          icon="x"
          label={`${props.title} verwerfen`}
          onPress={props.onDiscard}
          testID={props.testID ? `${props.testID}-discard` : undefined}
        />
        <IconButton
          icon="check"
          variant="filled"
          label={`${props.title} übernehmen`}
          onPress={props.onAccept}
          testID={props.testID ? `${props.testID}-accept` : undefined}
        />
      </View>
    </ToneContext.Provider>
  );
}
