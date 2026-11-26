import { Section } from '@housekeeping/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * A block of the recipe page (spec 0037, REQ-001): read by default, fields while the page is in
 * the edit mode; it has no pen of its own. `inline` for a block with its own heading (the head
 * with the title, the Einordnung).
 */
export function RecipeSection(props: {
  title: string;
  inline?: boolean;
  /** Beside the title, e.g. the portions stepper of "Zutaten". */
  accessory?: ReactNode;
  testID: string;
  children?: ReactNode;
}) {
  if (props.inline) return <View testID={props.testID}>{props.children}</View>;
  return (
    <Section title={props.title} action={props.accessory} testID={props.testID}>
      {props.children}
    </Section>
  );
}
