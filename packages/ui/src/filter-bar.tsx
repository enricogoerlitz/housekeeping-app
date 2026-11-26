import { useEffect, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { Button, Chip } from './controls';
import { Row, Surface, Text } from './primitives';
import { Sheet } from './overlay';
import { ScrollRow } from './scroll-row';
import { useBreakpoint, useTheme } from './theme-context';

export interface FilterBarProps {
  /** First row: the search field. */
  search?: ReactNode;
  /** Text of the filter button, with the count once filters are on: "Filter (1)". */
  filterLabel: string;
  /** Number of active filters; the button is highlighted while any is on. */
  activeCount: number;
  /** The sort menu (`Menu`), next to the filter button. */
  sort?: ReactNode;
  /** Quick chips and the chips of active filters (`Chip removable`); they scroll sideways. */
  chips?: ReactNode;
  /** At the end of the row, outside the chips that scroll, e.g. the view switch (spec 0038). */
  trailing?: ReactNode;
  /** All filter fields. Phones: a medium window; wider screens: unfolds below the row. */
  panel: ReactNode;
  /** Title of the window on phones. */
  panelTitle: string;
  resetLabel: string;
  onReset: () => void;
  /** What the window's main button does, with the live count: "8 Rezepte zeigen". */
  applyLabel: string;
  /** Wide screens: folds the panel away again ("Einklappen"). */
  collapseLabel: string;
  /** Parts get `${testID}-filter`, `-panel`, `-reset`, `-apply`, `-collapse`. */
  testID?: string;
}

/**
 * The controls above a filtered list (spec 0005, REQ-007): at most two rows, the search field and
 * one row with filter button, sort menu and quick chips. Filters apply at once; on phones the panel
 * is a medium window whose button only closes it.
 */
export function FilterBar(props: FilterBarProps) {
  const { isPhone } = useBreakpoint();
  const c = useTheme().colors;
  const [open, setOpen] = useState(false);
  const unfolded = open && !isPhone;
  useEffect(() => {
    // The unfolded panel is no modal: Escape closes it here on the web (spec 0008, platforms).
    if (!unfolded || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [unfolded]);
  const id = (part: string) => (props.testID ? `${props.testID}-${part}` : undefined);
  const reset = (
    <Button
      label={props.resetLabel}
      variant="link"
      size="sm"
      onPress={props.onReset}
      testID={id('reset')}
    />
  );

  return (
    <View testID={props.testID} style={{ gap: 10 }}>
      {props.search}
      <View testID={id('row')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ScrollRow>
            <Chip
              label={props.filterLabel}
              icon="list-filter"
              selected={props.activeCount > 0}
              onPress={() => setOpen(!open)}
              testID={id('filter')}
            />
            {props.sort}
            {props.chips}
          </ScrollRow>
        </View>
        {props.trailing ? (
          <>
            {/* A hairline keeps the chips that scroll apart from what stays (review 0003). */}
            <View
              aria-hidden
              style={{
                width: 1,
                alignSelf: 'stretch',
                marginVertical: 6,
                backgroundColor: c.border,
              }}
            />
            {props.trailing}
          </>
        ) : null}
      </View>
      {isPhone ? (
        <Sheet
          visible={open}
          onClose={() => setOpen(false)}
          title={props.panelTitle}
          size="m"
          testID={id('panel')}
          // The live count ("24 Rezepte · 2 Sammlungen zeigen") gets the whole width, so it stays
          // on one line at 390 px; "Zurücksetzen" below it (review 0003).
          footer={
            <View style={{ gap: 2, alignItems: 'center' }}>
              <View style={{ alignSelf: 'stretch' }}>
                <Button
                  label={props.applyLabel}
                  full
                  onPress={() => setOpen(false)}
                  testID={id('apply')}
                />
              </View>
              {/* A Button aligns itself to the start; the wrapper centres it. */}
              <View>{reset}</View>
            </View>
          }
        >
          {props.panel}
        </Sheet>
      ) : open ? (
        <Surface testID={id('panel')} style={{ gap: 12 }}>
          {props.panel}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            {reset}
            <Button
              label={props.collapseLabel}
              icon="chevron-up"
              variant="secondary"
              size="sm"
              onPress={() => setOpen(false)}
              testID={id('collapse')}
            />
          </View>
        </Surface>
      ) : null}
    </View>
  );
}

/**
 * One field of a filter panel: its title and the chips below it. Never wider than the panel, so
 * a long run of chips (13 cuisines) wraps inside it instead of running out (spec 0036, AC-005).
 */
export function FilterSection(props: { title: string; children: ReactNode; testID?: string }) {
  return (
    // maxWidth keeps it inside the panel; it never shrinks, or the sheet of a phone (a column)
    // squeezes it to its title (spec 0037).
    <View style={{ gap: 8, flexShrink: 0, maxWidth: '100%' }} testID={props.testID}>
      <Text variant="smallStrong">{props.title}</Text>
      <Row wrap gap={8}>
        {props.children}
      </Row>
    </View>
  );
}
