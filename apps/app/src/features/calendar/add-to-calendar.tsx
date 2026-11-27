import { useHousehold } from '@housekeeping/api';
import {
  googleCalendarUrl,
  icsFileName,
  notificationTargetHref,
  toICalendar,
  type CalendarEvent,
  type NotificationTarget,
} from '@housekeeping/core';
import { Button, Row, Text, toast } from '@housekeeping/ui';
import { Platform, View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { openLink } from '@/lib/open-link';

// Spec 0059, REQ-001/REQ-002: "In meinen Kalender" in the windows of an entry, a Termin of a
// series, a trip and a chore. The file is made on the device from the cache (offline too); the
// Google link needs the network. A copy: later changes in the app do not follow.

const CAN_DOWNLOAD = Platform.OS === 'web' && typeof document !== 'undefined';
/** The browser needs the address a moment after the click before it may go. */
const REVOKE_AFTER_MS = 10_000;

/** The address of a screen of the app, for the link in the calendar's note. */
export function appLink(target: NotificationTarget): string | undefined {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
  return origin ? `${origin}${notificationTargetHref(target)}` : undefined;
}

/** Hands the file to the browser as a download (Decision 9: a blob: link, no CSP change). */
function download(text: string, fileName: string): boolean {
  if (!CAN_DOWNLOAD) return false;
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
    return true;
  } catch {
    return false;
  }
}

export function AddToCalendar(props: { event: CalendarEvent; testID?: string }) {
  const household = useHousehold();
  const online = useOnlineOnly();
  const testID = props.testID ?? 'add-to-calendar';

  const saveFile = () => {
    const text = toICalendar(props.event, { now: new Date(), timeZone: household.timeZone });
    if (!download(text, icsFileName(props.event.title))) {
      toast.show({ message: 'Die Kalenderdatei ließ sich nicht speichern.' });
    }
  };

  return (
    <View style={{ gap: 8 }} testID={testID}>
      <Text variant="smallStrong">In meinen Kalender</Text>
      <Row gap={10} wrap>
        {CAN_DOWNLOAD ? (
          <Button
            label="Als Datei (.ics)"
            icon="calendar-plus"
            variant="secondary"
            size="sm"
            onPress={saveFile}
            hint="Für iPhone, Mac und Outlook: öffnet „Zum Kalender hinzufügen“."
            testID={`${testID}-ics`}
          />
        ) : null}
        <Button
          label="In Google Kalender"
          icon="external-link"
          variant="secondary"
          size="sm"
          disabled={online.disabled}
          hint={online.hint ?? 'Öffnet Google Kalender mit dem Termin zum Speichern.'}
          onPress={() => openLink(googleCalendarUrl(props.event, household.timeZone))}
          testID={`${testID}-google`}
        />
      </Row>
      <Text variant="small" color="muted">
        Eine Kopie – Änderungen in der App kommen nicht mit.
      </Text>
    </View>
  );
}
