import { useEffect, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { Button, Chip } from './controls';
import { Row, Surface, Text } from './primitives';
import { Sheet } from './overlay';
import { ScrollRow } from './scroll-row';
import { useBreakpoint } from './theme-context';

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
      variant={isPhone ? 'ghost' : 'link'}
      size={isPhone ? 'md' : 'sm'}
      onPress={props.onReset}
      testID={id('reset')}
    />
  );

  return (
    <View testID={props.testID} style={{ gap: 10 }}>
      {props.search}
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
      {isPhone ? (
        <Sheet
          visible={open}
          onClose={() => setOpen(false)}
          title={props.panelTitle}
          size="m"
          testID={id('panel')}
          footer={
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              {reset}
              <View style={{ flex: 1 }}>
                <Button
                  label={props.applyLabel}
                  full
                  onPress={() => setOpen(false)}
                  testID={id('apply')}
                />
              </View>
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
    <View style={{ gap: 8, flexShrink: 1, maxWidth: '100%' }} testID={props.testID}>
      <Text variant="smallStrong">{props.title}</Text>
      <Row wrap gap={8}>
        {props.children}
      </Row>
    </View>
  );
}
