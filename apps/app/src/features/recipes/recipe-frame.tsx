import { IconButton, Row, Screen, ScreenHeader, type TabSwipe } from '@housekeeping/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';

export interface RecipeFrameProps {
  /**
   * Beside the recipe list on wide screens (spec 0038, AC-001): no page of its own, a row with ✕
   * (`onBack`) and the actions above the content instead of the bar.
   */
  quick?: boolean;
  title: string;
  /** "‹ Essen" on the page; ✕ in the quick view. */
  onBack: () => void;
  backLabel: string;
  right?: ReactNode;
  /** The page's swipe through the list it was opened from (spec 0034, REQ-008). */
  swipe?: TabSwipe;
  children?: ReactNode;
}

/** The page around a recipe or a collection, or the quick view beside the list. */
export function RecipeFrame(props: RecipeFrameProps) {
  if (props.quick) {
    return (
      <View testID="recipe-screen">
        <Row justify="space-between" style={{ marginBottom: 8 }}>
          <IconButton
            icon="x"
            label="Rezept schließen"
            onPress={props.onBack}
            testID="recipe-close"
          />
          {props.right ? <Row gap={4}>{props.right}</Row> : null}
        </Row>
        {props.children}
      </View>
    );
  }
  return (
    <Screen
      testID="recipe-screen"
      tone="essen"
      tabSwipe={props.swipe}
      header={
        <ScreenHeader
          title={props.title}
          titleOnScroll
          backLabel={props.backLabel}
          onBack={props.onBack}
          right={props.right}
          testID="recipe-bar-title"
        />
      }
    >
      {props.children}
    </Screen>
  );
}
