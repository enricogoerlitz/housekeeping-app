import { KNOWN_UNITS } from '@housekeeping/core';
import { InfoHint } from '@housekeeping/ui';

/** The (i) next to an amount with a free unit: which units the app understands (spec 0036, AC-013). */
export function UnitsHint(props: { testID: string }) {
  return (
    <InfoHint label="Welche Einheiten?" testID={props.testID}>
      {`Die App versteht ${KNOWN_UNITS.join(', ')}. Zum Beispiel „400 ml“, „2 EL“ oder einfach „3“.`}
    </InfoHint>
  );
}
