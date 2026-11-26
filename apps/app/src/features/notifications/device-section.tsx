import { deviceRowLabel } from '@housekeeping/core';
import {
  Button,
  List,
  ListPlaceholder,
  ListRow,
  Section,
  Stack,
  SwitchRow,
  Text,
} from '@housekeeping/ui';

import { confirmFirst } from '@/features/shell/confirm-dialog';
import { OFFLINE_EDIT_HINT } from '@/features/shell/offline';

import type { ThisDevice } from './use-device-push';

/**
 * "Dieses Gerät" (REQ-002, REQ-003): the name and the permission, the switch for this device
 * only, and "Probe senden". The browser is never asked before a tap (AC-003).
 */
export function DeviceSection(props: { device: ThisDevice; offline: boolean }) {
  const { view, busy } = props.device;
  const hint = props.offline ? OFFLINE_EDIT_HINT : view.hint;
  return (
    <Section title="Dieses Gerät" testID="notif-device">
      <Stack gap={8}>
        <SwitchRow
          label="Auf diesem Gerät benachrichtigen"
          description={props.device.title}
          value={view.switchOn}
          disabled={view.switchDisabled || busy}
          onValueChange={props.device.setOn}
          testID="notif-device-switch"
        />
        {hint ? (
          <Text variant="small" color={props.offline ? 'warn' : 'muted'} testID="notif-device-hint">
            {hint}
          </Text>
        ) : null}
        <Stack gap={4}>
          <Button
            label="Probe senden"
            icon="bell"
            variant="ghost"
            size="sm"
            disabled={view.probeDisabled || busy}
            hint={view.probeHint}
            onPress={props.device.probe}
            testID="notif-probe"
          />
          {view.probeHint ? (
            <Text variant="small" color="muted" testID="notif-probe-hint">
              {view.probeHint}
            </Text>
          ) : null}
        </Stack>
      </Stack>
    </Section>
  );
}

/**
 * "Deine Geräte" (REQ-010): read from the server each time, never from the cache, so offline it
 * shows a hint instead (ADR-0014). Every device but this one can be removed (AC-041).
 */
export function DevicesSection(props: { device: ThisDevice }) {
  const list = props.device.devicesList;
  return (
    <Section title="Deine Geräte" testID="notif-devices">
      {list.status === 'offline' ? (
        <Text variant="small" color="warn" testID="notif-devices-offline">
          Offline – deine Geräte siehst du mit Netz
        </Text>
      ) : list.status === 'loading' ? (
        // A calm placeholder only when the server takes longer (spec 0034, AC-002).
        <ListPlaceholder label="Wird geladen …" rows={2} testID="notif-devices-loading" />
      ) : list.status === 'failed' ? (
        <Text variant="small" color="muted" testID="notif-devices-failed">
          Deine Geräte lassen sich gerade nicht laden.
        </Text>
      ) : list.devices.length === 0 ? (
        <Text variant="small" color="muted" testID="notif-devices-empty">
          {props.device.view.switchDisabled
            ? 'Noch kein Gerät angemeldet.'
            : 'Noch kein Gerät angemeldet. Schalte oben „Auf diesem Gerät benachrichtigen“ ein.'}
        </Text>
      ) : (
        <List>
          {list.devices.map((device) => (
            <ListRow
              key={device.id}
              title={deviceRowLabel(device)}
              controls={
                device.isCurrent ? undefined : (
                  <Button
                    label="Entfernen"
                    variant="ghost"
                    size="sm"
                    disabled={props.device.busy}
                    onPress={() =>
                      confirmFirst({
                        title: `„${deviceRowLabel(device)}“ entfernen?`,
                        message: 'Dieses Gerät bekommt dann keine Mitteilungen mehr.',
                        confirmLabel: 'Entfernen',
                        onConfirm: () => props.device.remove(device),
                        testID: 'confirm-remove-device',
                      })
                    }
                    testID={`notif-device-remove-${device.id}`}
                  />
                )
              }
              testID={`notif-device-${device.id}`}
            />
          ))}
        </List>
      )}
    </Section>
  );
}
