import { KNOWN_UNITS } from '@housekeeping/core';
import { InfoHint } from '@housekeeping/ui';

/** The (i) next to an amount with a free unit: which units the app understands (spec 0036, AC-013). */
export function UnitsHint(props: { testID: string }) {
  // The list ends with "Msp.": its own period ends the sentence too.
  const units = KNOWN_UNITS.join(', ');
  const sentence = units.endsWith('.') ? units : `${units}.`;
  return (
    <InfoHint label="Welche Einheiten?" testID={props.testID}>
      {`Die App versteht ${sentence} Zum Beispiel „400 ml“, „2 EL“ oder einfach „3“.`}
    </InfoHint>
  );
}
