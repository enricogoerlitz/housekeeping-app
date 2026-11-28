import { Screen, ScreenHeader, type Tone } from '@housekeeping/ui';
import type { ReactNode } from 'react';

import { useBrowseSwipe } from '@/lib/browse-order';

export interface DetailPageProps {
  /** Set on its own page; without it (split view on wide screens) only the content renders. */
  onBack?: () => void;
  /** The origin on the back link, e.g. "Übersicht" (spec 0019, REQ-006); else an arrow. */
  backLabel?: string;
  title: string;
  titleTestID?: string;
  /** Actions in the header, e.g. the favourite; they stay in the narrow bar. */
  right?: ReactNode;
  tone?: Tone;
  testID?: string;
  children?: ReactNode;
}

/**
 * A recipe, restaurant or activity on its own page: the header with "Zurück", title and actions
 * stays at the top while the page scrolls (spec 0005, AC-001, AC-002).
 */
export function DetailPage(props: DetailPageProps) {
  const swipe = useBrowseSwipe();
  if (!props.onBack) return <>{props.children}</>;
  return (
    <Screen
      testID={props.testID}
      tone={props.tone}
      tabSwipe={swipe}
      header={
        <ScreenHeader
          title={props.title}
          onBack={props.onBack}
          backLabel={props.backLabel}
          right={props.right}
          // The big title stands in the content, in the full width; the bar shows it small once
          // it has scrolled away (as on a recipe).
          titleOnScroll
          testID={props.titleTestID ? `${props.titleTestID}-bar` : undefined}
        />
      }
    >
      {props.children}
    </Screen>
  );
}
