import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Button, Chip } from './controls';
import { Surface } from './primitives';
import { Sheet } from './overlay';
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, alignItems: 'center', paddingVertical: 2 }}
      >
        <Chip
          label={props.filterLabel}
          icon="list-filter"
          selected={props.activeCount > 0}
          onPress={() => setOpen(!open)}
          testID={id('filter')}
        />
        {props.sort}
        {props.chips}
      </ScrollView>
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
