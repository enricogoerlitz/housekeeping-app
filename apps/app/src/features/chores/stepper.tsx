import { IconButton, Row, Text } from '@housekeeping/ui';

/** A number picker with minus and plus, e.g. "alle 2 Wochen". */
export function Stepper(props: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Text shown for the value, e.g. "alle 2 Wochen". */
  format: (value: number) => string;
  /** Accessible name of the setting, e.g. "Wochen". */
  label: string;
  testID: string;
}) {
  return (
    <Row gap={4}>
      <IconButton
        icon="minus"
        variant="soft"
        label={`${props.label} weniger`}
        disabled={props.value <= props.min}
        onPress={() => props.onChange(Math.max(props.min, props.value - 1))}
        testID={`${props.testID}-minus`}
      />
      <Text
        variant="bodyStrong"
        style={{ minWidth: 132, textAlign: 'center' }}
        testID={`${props.testID}-value`}
      >
        {props.format(props.value)}
      </Text>
      <IconButton
        icon="plus"
        variant="soft"
        label={`${props.label} mehr`}
        disabled={props.value >= props.max}
        onPress={() => props.onChange(Math.min(props.max, props.value + 1))}
        testID={`${props.testID}-plus`}
      />
    </Row>
  );
}
