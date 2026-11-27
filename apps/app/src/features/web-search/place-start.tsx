import { draftLinks, PLACE_CREATE_PATHS, type ProposalPlaceKind } from '@housekeeping/core';
import { openKeyboardNow, type SheetActions } from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

import { OneFieldCreate } from './one-field-create';
import { useWebSearch } from './use-web-search';
import { webSearchPrimary, type WebTake } from './web-search-panel';

const LABELS = {
  restaurant: 'Name oder Link',
  activity: 'Name',
} as const satisfies Record<ProposalPlaceKind, string>;

const PLACEHOLDERS = {
  restaurant: 'Name oder Kartenlink',
  activity: 'z. B. Kletterhalle',
} as const satisfies Record<ProposalPlaceKind, string>;

/**
 * The first step of "Restaurant hinzufügen" and "Aktivität anlegen" (spec 0062, REQ-008): one
 * field with "Anlegen" and "Websuche" in the same window. "Anlegen" hands the name (or a map link)
 * to the form; "Übernehmen" of a card hands the card to the form like "Im Web suchen" (spec 0049,
 * AC-015). `active` false skips it (editing, a shared link, the empty state's first steps).
 */
export function usePlaceStart(props: {
  kind: ProposalPlaceKind;
  active: boolean;
  /** Name typed: fills the form's name; a link: the form's map link. */
  onName: (name: string) => void;
  onLink: (link: string) => void;
  onTake: (taken: WebTake) => void;
  testID: string;
}): { open: boolean; body: ReactNode; actions: SheetActions | undefined; grown: boolean } {
  const online = useOnlineOnly();
  const [open, setOpen] = useState(props.active);
  const [text, setText] = useState('');
  const search = useWebSearch(props.kind);
  if (!open) return { open, body: null, actions: undefined, grown: false };
  const toForm = () => {
    const link = draftLinks(text)[0];
    // The form's name field takes the keyboard with this tap (spec 0033, REQ-006).
    openKeyboardNow();
    if (link) props.onLink(text.trim());
    else props.onName(text.trim());
    setOpen(false);
  };
  const take = (taken: WebTake) => {
    props.onTake(taken);
    setOpen(false);
  };
  return {
    open,
    grown: search.state.status !== 'idle' || search.preview !== undefined,
    actions: search.preview
      ? { primary: webSearchPrimary(search, online, take, `${props.testID}-web`) }
      : undefined,
    body: (
      <OneFieldCreate
        text={text}
        onChangeText={setText}
        paths={PLACE_CREATE_PATHS}
        createWhenEmpty
        onPath={toForm}
        search={search}
        label={LABELS[props.kind]}
        placeholder={PLACEHOLDERS[props.kind]}
        testID={props.testID}
      />
    ),
  };
}
