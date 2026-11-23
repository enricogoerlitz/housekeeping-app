import type { ReactNode } from 'react';

/** On native the toast already stands above windows; the web needs its own layer (`.web.tsx`). */
export function TopLayer(props: { children: ReactNode }) {
  return <>{props.children}</>;
}
