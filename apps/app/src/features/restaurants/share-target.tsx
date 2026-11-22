import { Redirect } from 'expo-router';

import { usePageParams } from '@/lib/url-state';

/** Shared text longer than this is not a map link or a name; it is cut instead of carried along. */
const MAX_SHARED_LENGTH = 2000;

function cut(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().slice(0, MAX_SHARED_LENGTH);
  return trimmed || undefined;
}

/**
 * Share target `/teilen?url=…&text=…` (Android PWA now, native share extension later, AC-008):
 * opens "Essen → Restaurants" of the active household with "Restaurant hinzufügen" prefilled
 * (`fenster=neu-restaurant&link&name`, spec 0019).
 */
export function ShareTarget() {
  const { params } = usePageParams('teilen');
  const url = cut(params.url);
  const text = cut(params.text);
  // Map apps often share "Name https://…" as one text; the name is what remains without the link.
  const name = text?.replace(/https?:\/\/\S+/g, '').trim() || undefined;
  const link = url ?? text;
  const shareParams: Record<string, string> = { ansicht: 'restaurants', fenster: 'neu-restaurant' };
  if (link) shareParams.link = link;
  if (name) shareParams.name = name;
  return <Redirect href={{ pathname: '/rezepte', params: shareParams }} />;
}
