import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { keyboardFocusRing } from './controls';
import { expandableA11y } from './expandable';
import { Icon, Text } from './primitives';
import { useTheme } from './theme-context';

export interface ProgressStep {
  id: string;
  /** One line, e.g. "Sucht im Web · 6 Quellen" or "Liest eure Rezepte · 20 von 143". */
  line: string;
  /** Shown when the step is opened, e.g. the search terms. */
  details: readonly string[];
  running: boolean;
}

export interface ProgressStepsProps {
  steps: readonly ProgressStep[];
  /** Read after the line of a running step, e.g. "läuft". */
  runningLabel: string;
  /** Each row is `${testID}-${id}`, its toggle `-toggle`, its details `-details`. */
  testID?: string;
}

function StepRow(props: { step: ProgressStep; runningLabel: string; testID?: string }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const { step } = props;
  const id = (part: string) => (props.testID ? `${props.testID}-${part}` : undefined);
  const label = step.running ? `${step.line}, ${props.runningLabel}` : step.line;
  const dot = (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: step.running ? theme.colors.accent : theme.colors.textMuted,
      }}
    />
  );
  const line = (
    <Text variant="small" color="muted" style={{ flexShrink: 1 }}>
      {step.line}
    </Text>
  );
  return (
    <View testID={props.testID}>
      {step.details.length > 0 ? (
        <Pressable
          testID={id('toggle')}
          accessibilityRole="button"
          {...expandableA11y(label, open, Platform.OS)}
          onPress={() => setOpen(!open)}
          style={(state) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              minHeight: 32,
              alignSelf: 'flex-start',
              borderRadius: 6,
              opacity: state.pressed ? 0.6 : 1,
            },
            keyboardFocusRing(theme, (state as { focused?: boolean }).focused),
          ]}
        >
          {dot}
          {line}
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color="muted" />
        </Pressable>
      ) : (
        <View
          accessible
          accessibilityLabel={label}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}
        >
          {dot}
          {line}
        </View>
      )}
      {open ? (
        <View testID={id('details')} style={{ paddingLeft: 16, gap: 2, paddingBottom: 4 }}>
          {step.details.map((detail, index) => (
            <Text key={`${index}-${detail}`} variant="small" color="muted">
              {`„${detail}“`}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * What an assistant is doing right now or did (spec 0066, REQ-005): one quiet row per step with a
 * dot (accent while it runs), opened by a tap to show its details. The same rows will show the
 * household tools of step 2 ("Liest eure Rezepte · Suche „Curry“ · 20 von 143").
 */
export function ProgressSteps(props: ProgressStepsProps) {
  if (props.steps.length === 0) return null;
  return (
    <View testID={props.testID} style={{ gap: 2 }}>
      {props.steps.map((step) => (
        <StepRow
          key={step.id}
          step={step}
          runningLabel={props.runningLabel}
          testID={props.testID ? `${props.testID}-${step.id}` : undefined}
        />
      ))}
    </View>
  );
}
