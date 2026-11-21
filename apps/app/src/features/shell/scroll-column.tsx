import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

/** One scrolling column of a two-column layout (list and detail side by side on wide screens). */
export function ScrollColumn(props: { children: ReactNode }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 96 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {props.children}
    </ScrollView>
  );
}
