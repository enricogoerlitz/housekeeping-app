import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { EmptyState } from './display';
import type { IconName } from './icons';
import { useBreakpoint } from './theme-context';

export interface ListDetailProps {
  /**
   * The list column. It scrolls on its own: an InfiniteList or a ScrollView that fills the column.
   */
  list: ReactNode;
  /** What is chosen in the list; undefined shows the placeholder. */
  detail?: ReactNode;
  /** Placeholder while nothing is chosen, e.g. "Wähl eine Aufgabe aus". */
  placeholder: { icon: IconName; title: string; text?: string };
  /** Widest list column in points; it takes 40 % of the width below that. Default 400. */
  listWidth?: number;
  /** Parts get `${testID}-list`, `-detail`, `-placeholder`. */
  testID?: string;
}

/**
 * The layout "Liste und Detail" (spec 0005, concept 2.11) for tablets and desktops: the list on the
 * left, what is chosen in it on the right; both columns scroll on their own, so the list keeps its
 * place while the detail changes. On phones only the list shows: the detail opens there as a
 * window or a page of its own, which the caller decides. Use it in a Screen with `scroll={false}`
 * and `style={{ flex: 1 }}`.
 */
export function ListDetail(props: ListDetailProps) {
  const { isPhone } = useBreakpoint();
  const id = (part: string) => (props.testID ? `${props.testID}-${part}` : undefined);
  if (isPhone) return <View style={{ flex: 1 }}>{props.list}</View>;
  return (
    <View testID={props.testID} style={{ flex: 1, flexDirection: 'row', gap: 32 }}>
      <View testID={id('list')} style={{ width: '40%', maxWidth: props.listWidth ?? 400 }}>
        {props.list}
      </View>
      <ScrollView
        testID={id('detail')}
        style={{ flex: 1, minWidth: 0 }}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {props.detail ?? (
          <EmptyState
            icon={props.placeholder.icon}
            title={props.placeholder.title}
            text={props.placeholder.text}
            testID={id('placeholder')}
          />
        )}
      </ScrollView>
    </View>
  );
}
